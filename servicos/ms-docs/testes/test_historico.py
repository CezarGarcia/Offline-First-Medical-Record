"""GET /api/documentos/email (admin): histórico de envios, do mais recente para o mais antigo."""

import uuid

from .conftest import autorizacao


def test_historico_filtrado_por_atendimento(cliente, clinico, caixa, token_operacional, token_admin):
    atendimento = clinico.novo_atendimento()
    ids = []
    for n in range(3):
        endereco = f"historico-{n}-{uuid.uuid4().hex[:6]}@exemplo.com"
        resposta = cliente.post(
            f"/api/documentos/ficha/{atendimento['id']}/email",
            json={"destinatario": {"tipo": "OUTRO", "email": endereco}},
            headers=autorizacao(token_operacional),
        )
        assert resposta.status_code == 201
        ids.append(resposta.json()["id"])

    resposta = cliente.get(
        "/api/documentos/email",
        params={"atendimentoId": atendimento["id"], "tamanho": 2},
        headers=autorizacao(token_admin),
    )
    assert resposta.status_code == 200
    pagina = resposta.json()
    assert pagina["total"] == 3
    assert pagina["pagina"] == 1
    assert pagina["tamanho"] == 2
    assert [item["id"] for item in pagina["itens"]] == [ids[2], ids[1]]
    assert set(pagina["itens"][0]) == {
        "id",
        "atendimentoId",
        "status",
        "destinatarioTipo",
        "destinatarioEmail",
        "erro",
        "tentativas",
        "solicitadoPorId",
        "dispositivoId",
        "solicitadoEm",
        "ultimaTentativaEm",
        "enviadoEm",
    }

    segunda = cliente.get(
        "/api/documentos/email",
        params={"atendimentoId": atendimento["id"], "tamanho": 2, "pagina": 2},
        headers=autorizacao(token_admin),
    ).json()
    assert [item["id"] for item in segunda["itens"]] == [ids[0]]


def test_parametros_invalidos(cliente, token_admin):
    for parametros, campo in (
        ({"tamanho": 500}, "tamanho"),
        ({"pagina": 0}, "pagina"),
        ({"atendimentoId": "x"}, "atendimentoId"),
    ):
        resposta = cliente.get("/api/documentos/email", params=parametros, headers=autorizacao(token_admin))
        assert resposta.status_code == 400
        assert resposta.json()["detalhes"][0]["campo"] == campo
