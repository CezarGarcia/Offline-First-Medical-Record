"""POST /api/documentos/ficha/{id}/email: envio da ficha, idempotência e erros (docs/06-api.md, seção 6.10)."""

import threading
import uuid

from sqlalchemy import text

from ms_docs.config import ConfigSmtp
from ms_docs.correio import Anexo, EnvioPorSmtp, FalhaNoEnvio, MensagemDeEmail

from .conftest import autorizacao, porta_livre


def _pedir(cliente, token, atendimento_id, corpo, **cabecalhos):
    return cliente.post(
        f"/api/documentos/ficha/{atendimento_id}/email", json=corpo, headers=autorizacao(token, **cabecalhos)
    )


def _registro(engine, envio_id):
    with engine.connect() as conexao:
        return (
            conexao.execute(text("SELECT * FROM documentos.envio_email WHERE id = :id"), {"id": envio_id})
            .mappings()
            .first()
        )


def test_envia_para_o_paciente(cliente, clinico, caixa, engine, token_operacional, enfermeiro):
    email_paciente = f"paciente-{uuid.uuid4().hex[:8]}@exemplo.com"
    atendimento = clinico.novo_atendimento(pessoa={"email": email_paciente})
    pedido_id = str(uuid.uuid4())
    dispositivo = str(uuid.uuid4())

    resposta = _pedir(
        cliente,
        token_operacional,
        atendimento["id"],
        {"id": pedido_id, "destinatario": {"tipo": "PACIENTE"}},
        **{"X-Dispositivo-Id": dispositivo},
    )

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["id"] == pedido_id
    assert corpo["atendimentoId"] == atendimento["id"]
    assert corpo["status"] == "ENVIADO"
    assert corpo["destinatarioTipo"] == "PACIENTE"
    assert corpo["destinatarioEmail"] == email_paciente
    assert corpo["tentativas"] == 1
    assert corpo["erro"] is None
    assert corpo["solicitadoPorId"] == str(enfermeiro.id)
    assert corpo["dispositivoId"] == dispositivo
    assert corpo["enviadoEm"].endswith("Z")

    [mensagem] = caixa.para(email_paciente)
    assert mensagem["Subject"] == "MedicalField — Ficha de Atendimento de João da Silva (28/10/2026)"
    assert mensagem["From"] == "MedicalField <medicalfield@exemplo.com>"
    texto = mensagem.get_body(preferencelist=("plain",)).get_content()
    assert "ficha do atendimento pré-hospitalar de João da Silva" in texto
    assert "Dra. Ana Souza (CRM 12345-RS)" in texto
    assert "O envio foi solicitado por Enf. Teste (COREN 999001-RS)." in texto
    assert "LGPD" in texto
    [anexo] = list(mensagem.iter_attachments())
    numero = atendimento["id"].replace("-", "")[-8:].upper()
    assert anexo.get_filename() == f"ficha-atendimento-{numero}.pdf"
    assert anexo.get_content_type() == "application/pdf"
    assert anexo.get_content().startswith(b"%PDF-")

    registro = _registro(engine, pedido_id)
    assert registro["status"] == "ENVIADO" and registro["tentativas"] == 1


def test_repetir_o_pedido_nao_manda_outro_email(cliente, clinico, caixa, token_operacional):
    email_contato = f"familiar-{uuid.uuid4().hex[:8]}@exemplo.com"
    atendimento = clinico.novo_atendimento(pessoa={"contato": {"nome": "Maria", "email": email_contato}})
    pedido = {"id": str(uuid.uuid4()), "destinatario": {"tipo": "FAMILIAR"}}

    primeiro = _pedir(cliente, token_operacional, atendimento["id"], pedido)
    # O primeiro pedido vale: um reenvio com outro corpo devolve o que já foi feito
    segundo = _pedir(
        cliente,
        token_operacional,
        atendimento["id"],
        {"id": pedido["id"], "destinatario": {"tipo": "OUTRO", "email": "outra@exemplo.com"}},
    )

    assert primeiro.status_code == 201
    assert segundo.status_code == 200
    assert segundo.json() == primeiro.json()
    assert len(caixa.para(email_contato)) == 1
    assert caixa.para("outra@exemplo.com") == []


def test_envia_para_outro_endereco(cliente, clinico, caixa, token_operacional):
    atendimento = clinico.novo_atendimento()
    endereco = f"hospital-{uuid.uuid4().hex[:8]}@exemplo.com.br"
    resposta = _pedir(
        cliente, token_operacional, atendimento["id"], {"destinatario": {"tipo": "OUTRO", "email": f"  {endereco} "}}
    )
    assert resposta.status_code == 201
    # Sem "id" no corpo, o servidor gera um (UUID v7)
    assert uuid.UUID(resposta.json()["id"]).version == 7
    assert resposta.json()["destinatarioEmail"] == endereco
    assert len(caixa.para(endereco)) == 1


def test_paciente_ou_familiar_sem_email(cliente, clinico, engine, token_operacional):
    atendimento = clinico.novo_atendimento(pessoa={"email": None, "contato": {"nome": "Maria", "email": None}})
    for tipo, codigo in (("PACIENTE", "PACIENTE_SEM_EMAIL"), ("FAMILIAR", "FAMILIAR_SEM_EMAIL")):
        pedido_id = str(uuid.uuid4())
        resposta = _pedir(
            cliente, token_operacional, atendimento["id"], {"id": pedido_id, "destinatario": {"tipo": tipo}}
        )
        assert resposta.status_code == 422
        assert resposta.json()["erro"] == codigo
        # Nada foi enviado, então nada fica registrado
        assert _registro(engine, pedido_id) is None


def test_validacao_do_corpo(cliente, clinico, token_operacional):
    atendimento = clinico.novo_atendimento()
    casos = [
        ({"destinatario": {"tipo": "OUTRO"}}, "destinatario.email", "obrigatório quando o tipo é OUTRO"),
        (
            {"destinatario": {"tipo": "OUTRO", "email": "sem-arroba"}},
            "destinatario.email",
            "formato inválido (esperado: email)",
        ),
        (
            {"destinatario": {"tipo": "PACIENTE", "email": "a@b.com"}},
            "destinatario.email",
            "só pode ser informado quando o tipo é OUTRO",
        ),
        (
            {"destinatario": {"tipo": "VIZINHO"}},
            "destinatario.tipo",
            "valor não permitido (use: PACIENTE, FAMILIAR, OUTRO)",
        ),
        ({}, "destinatario", "campo obrigatório"),
        ({"id": "123", "destinatario": {"tipo": "PACIENTE"}}, "id", "formato inválido (esperado: uuid)"),
        ({"destinatario": {"tipo": "PACIENTE"}, "extra": 1}, "extra", "campo não permitido"),
    ]
    for corpo, campo, mensagem in casos:
        resposta = _pedir(cliente, token_operacional, atendimento["id"], corpo)
        assert resposta.status_code == 400, corpo
        assert resposta.json()["erro"] == "VALIDACAO"
        assert {"campo": campo, "mensagem": mensagem} in resposta.json()["detalhes"], corpo


def test_corpo_que_nao_e_json(cliente, clinico, token_operacional):
    atendimento = clinico.novo_atendimento()
    resposta = cliente.post(
        f"/api/documentos/ficha/{atendimento['id']}/email",
        content=b"{isto nao e json",
        headers=autorizacao(token_operacional, **{"Content-Type": "application/json"}),
    )
    assert resposta.status_code == 400
    assert resposta.json()["detalhes"][0]["campo"] == "corpo"


def test_atendimento_inexistente(cliente, engine, token_operacional):
    pedido_id = str(uuid.uuid4())
    resposta = _pedir(cliente, token_operacional, uuid.uuid4(), {"id": pedido_id, "destinatario": {"tipo": "PACIENTE"}})
    assert resposta.status_code == 404
    assert _registro(engine, pedido_id) is None


def test_falha_no_smtp_e_nova_tentativa(cliente, clinico, caixa, engine, token_operacional):
    endereco = f"paciente-{uuid.uuid4().hex[:8]}@exemplo.com"
    atendimento = clinico.novo_atendimento(pessoa={"email": endereco})
    pedido_id = str(uuid.uuid4())

    caixa.recusar = True
    falhou = _pedir(
        cliente, token_operacional, atendimento["id"], {"id": pedido_id, "destinatario": {"tipo": "PACIENTE"}}
    )
    assert falhou.status_code == 502
    assert falhou.json()["erro"] == "FALHA_ENVIO_EMAIL"
    registro = _registro(engine, pedido_id)
    assert registro["status"] == "ERRO"
    assert registro["tentativas"] == 1
    assert registro["erro"] == "O servidor de e-mail recusou a mensagem (código 451)."
    assert registro["enviado_em"] is None

    # O cliente tenta de novo com o mesmo ID (a fila do app faz isso sozinha): agora o servidor aceita
    caixa.recusar = False
    deu_certo = _pedir(
        cliente,
        token_operacional,
        atendimento["id"],
        {"id": pedido_id, "destinatario": {"tipo": "OUTRO", "email": "outra@exemplo.com"}},
    )
    assert deu_certo.status_code == 201
    corpo = deu_certo.json()
    assert corpo["status"] == "ENVIADO"
    assert corpo["tentativas"] == 2
    assert corpo["erro"] is None
    # O destinatário continua o do primeiro pedido
    assert corpo["destinatarioTipo"] == "PACIENTE"
    assert corpo["destinatarioEmail"] == endereco
    assert len(caixa.para(endereco)) == 1
    assert caixa.para("outra@exemplo.com") == []


def test_dois_pedidos_iguais_ao_mesmo_tempo(cliente, clinico, caixa, token_operacional):
    """O app pode reenviar enquanto o primeiro envio ainda está em andamento: só um e-mail pode sair."""
    endereco = f"paciente-{uuid.uuid4().hex[:8]}@exemplo.com"
    atendimento = clinico.novo_atendimento(pessoa={"email": endereco})
    pedido = {"id": str(uuid.uuid4()), "destinatario": {"tipo": "PACIENTE"}}
    caixa.atraso_s = 1.0
    respostas = []

    def pedir():
        respostas.append(_pedir(cliente, token_operacional, atendimento["id"], pedido).status_code)

    linhas = [threading.Thread(target=pedir) for _ in range(2)]
    for linha in linhas:
        linha.start()
    for linha in linhas:
        linha.join()

    assert sorted(respostas) == [200, 201]
    assert len(caixa.para(endereco)) == 1


def test_adaptador_smtp_sem_servidor():
    """Servidor de e-mail fora do ar: o adaptador traduz o erro de rede numa FalhaNoEnvio."""
    config = ConfigSmtp(
        host="127.0.0.1",
        porta=porta_livre(),
        usuario=None,
        senha=None,
        remetente="medicalfield@exemplo.com",
        seguranca="NENHUMA",
        tempo_limite_s=2,
    )
    mensagem = MensagemDeEmail(para="a@exemplo.com", assunto="x", texto="y")
    try:
        EnvioPorSmtp(config).enviar(mensagem)
    except FalhaNoEnvio as falha:
        assert str(falha) == "o servidor de e-mail não respondeu."
    else:
        raise AssertionError("deveria ter falhado")


def test_adaptador_smtp_monta_a_mensagem():
    config = ConfigSmtp(
        host="smtp.exemplo.com",
        porta=587,
        usuario="conta@exemplo.com",
        senha="x",
        remetente="conta@exemplo.com",
        seguranca="STARTTLS",
    )
    mensagem = MensagemDeEmail(
        para="destino@exemplo.com",
        assunto="MedicalField — Ficha de Atendimento de João (28/10/2026)",
        texto="Olá\n",
        anexos=(Anexo(nome="ficha.pdf", tipo="application/pdf", conteudo=b"%PDF-1.7 teste"),),
    )
    email = EnvioPorSmtp(config).converter(mensagem)
    assert email["From"] == "MedicalField <conta@exemplo.com>"
    assert email["To"] == "destino@exemplo.com"
    assert email["Subject"] == "MedicalField — Ficha de Atendimento de João (28/10/2026)"
    assert email["Message-ID"].endswith("@exemplo.com>")
    [anexo] = list(email.iter_attachments())
    assert anexo.get_filename() == "ficha.pdf"
    assert anexo.get_content() == b"%PDF-1.7 teste"
