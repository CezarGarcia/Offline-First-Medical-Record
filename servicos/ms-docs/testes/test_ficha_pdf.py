"""GET /api/documentos/ficha/{id}/pdf: o PDF da ficha (docs/09-ficha-e-dominio.md, seção 9.5)."""

import io
import uuid

from pypdf import PdfReader

from .conftest import autorizacao


def _texto(pdf: bytes) -> tuple[str, int]:
    leitor = PdfReader(io.BytesIO(pdf))
    return "\n".join(pagina.extract_text() for pagina in leitor.pages), len(leitor.pages)


def test_pdf_completo(cliente, clinico, token_operacional):
    atendimento = clinico.novo_atendimento()
    resposta = cliente.get(f"/api/documentos/ficha/{atendimento['id']}/pdf", headers=autorizacao(token_operacional))

    assert resposta.status_code == 200
    assert resposta.headers["content-type"] == "application/pdf"
    numero = atendimento["id"].replace("-", "")[-8:].upper()
    assert resposta.headers["content-disposition"] == f'attachment; filename="ficha-atendimento-{numero}.pdf"'
    assert resposta.headers["cache-control"] == "no-store"
    assert resposta.content.startswith(b"%PDF-")

    texto, paginas = _texto(resposta.content)
    assert paginas == 1
    for esperado in [
        "Ficha de Atendimento Pré-Hospitalar",
        f"Nº {numero}",
        "28/10/2026 às 11:20",  # 14:20 UTC no horário de Brasília
        "João da Silva",
        "529.982.247-25",
        "10/05/1980 (46 anos)",
        "(51) 99999-0000",
        "Maria da Silva (Esposa) · (51) 98888-0000 · maria.silva@exemplo.com",
        "Dipirona",
        "Hipertensão",
        "Losartana 50 mg",
        "Clínica",
        "Dor no peito há cerca de uma hora",
        "LARANJA",
        "Protocolo Manchester",
        "Muito urgente · até 10 min",
        "Obedece a comandos",
        "150 × 95 mmHg",
        "36,6 °C",
        "Ácido acetilsalicílico (AAS)",
        "200 mg",
        "Oral",
        "11:28",
        "Mastigar",
        "Encaminhado ao hospital",
        "Hospital Regional",
        "Monitorização cardíaca; oxigênio 2 L/min",
        "Dra. Ana Souza (CRM 12345-RS)",
        "Ambulância 01",
        "Online",
        atendimento["id"],
        "Documento com dados pessoais sensíveis (LGPD). Uso restrito.",
        f"Ficha Nº {numero} · página 1 de 1",
    ]:
        assert esperado in texto, esperado


def test_pdf_com_o_minimo(cliente, clinico, token_operacional):
    """Atendimento só com os obrigatórios: os vazios aparecem como tal, sem quebrar o documento."""
    pessoa = clinico.novo_atendimento()["pessoa"] | {
        "nome": "Desconhecido",
        "cpf": None,
        "dataNascimento": None,
        "sexo": None,
        "telefone": None,
        "email": None,
        "contato": None,
    }
    atendimento = clinico.novo_atendimento(
        pessoa=pessoa,
        prontuario={
            "tipoSanguineo": "DESCONHECIDO",
            "alergias": None,
            "comorbidades": None,
            "medicamentosUsoContinuo": None,
        },
        localOcorrencia=None,
        tipoOcorrencia="TRAUMA",
        triagem={"protocolo": "START", "cor": "PRETO"},
        glasgow=None,
        sinaisVitais=None,
        medicamentos=[],
        procedimentos=None,
        desfecho={"tipo": "OBITO", "destino": None},
        origem={"modo": "OFFLINE"},
    )
    resposta = cliente.get(f"/api/documentos/ficha/{atendimento['id']}/pdf", headers=autorizacao(token_operacional))
    assert resposta.status_code == 200
    texto, _ = _texto(resposta.content)
    for esperado in [
        "Desconhecido",
        "não informado",
        "PRETO",
        "Protocolo START",
        "Óbito ou sem chance de sobrevida",
        "Não avaliada.",
        "não medido",
        "Nenhum medicamento administrado.",
        "Óbito",
        "Offline",
    ]:
        assert esperado in texto, esperado
    assert "Destino" not in texto


def test_ficha_longa_continua_na_pagina_seguinte(cliente, clinico, token_operacional):
    item = clinico.novo_atendimento()["medicamentos"][0]
    medicamentos = [item | {"id": str(uuid.uuid4()), "observacao": f"Dose {n}"} for n in range(1, 31)]
    atendimento = clinico.novo_atendimento(medicamentos=medicamentos)
    resposta = cliente.get(f"/api/documentos/ficha/{atendimento['id']}/pdf", headers=autorizacao(token_operacional))
    texto, paginas = _texto(resposta.content)
    assert paginas == 2
    assert "Dose 30" in texto
    assert "página 2 de 2" in texto


def test_repassa_o_token_e_a_origem_ao_ms_clinico(cliente, clinico, token_operacional):
    atendimento = clinico.novo_atendimento()
    dispositivo = str(uuid.uuid4())
    cliente.get(
        f"/api/documentos/ficha/{atendimento['id']}/pdf",
        headers=autorizacao(token_operacional, **{"X-Real-IP": "200.10.20.30", "X-Dispositivo-Id": dispositivo}),
    )
    chamada = clinico.chamadas[-1]
    assert chamada.url.path == f"/api/atendimento/detalhe/{atendimento['id']}"
    assert chamada.headers["authorization"] == f"Bearer {token_operacional}"
    assert chamada.headers["x-real-ip"] == "200.10.20.30"
    assert chamada.headers["x-dispositivo-id"] == dispositivo
    assert chamada.headers["user-agent"] == "ms-docs"


def test_atendimento_inexistente(cliente, token_operacional):
    resposta = cliente.get(f"/api/documentos/ficha/{uuid.uuid4()}/pdf", headers=autorizacao(token_operacional))
    assert resposta.status_code == 404
    assert resposta.json()["erro"] == "NAO_ENCONTRADO"


def test_id_invalido(cliente, token_operacional):
    resposta = cliente.get("/api/documentos/ficha/123/pdf", headers=autorizacao(token_operacional))
    assert resposta.status_code == 400
    assert resposta.json()["detalhes"] == [{"campo": "id", "mensagem": "formato inválido (esperado: uuid)"}]


def test_ms_clinico_fora_do_ar(cliente, clinico, token_operacional):
    atendimento = clinico.novo_atendimento()
    clinico.fora_do_ar = True
    try:
        resposta = cliente.get(f"/api/documentos/ficha/{atendimento['id']}/pdf", headers=autorizacao(token_operacional))
    finally:
        clinico.fora_do_ar = False
    assert resposta.status_code == 503
    assert resposta.json()["erro"] == "SERVICO_INDISPONIVEL"
