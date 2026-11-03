"""Middleware de log de acesso: toda requisição vira uma linha em auditoria.log_acesso (docs/08, seção 8.9)."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from .conftest import autorizacao


def _logs(app, banco_auditoria, user_agent):
    app.state.registrador.aguardar_pendentes()
    with banco_auditoria.connect() as conexao:
        return (
            conexao.execute(
                text("SELECT * FROM auditoria.log_acesso WHERE user_agent = :ua ORDER BY data_hora"), {"ua": user_agent}
            )
            .mappings()
            .all()
        )


def test_registra_requisicao_autenticada(app, cliente, clinico, banco_auditoria, token_operacional, enfermeiro):
    atendimento = clinico.novo_atendimento()
    user_agent = f"teste-log/{uuid.uuid4()}"
    dispositivo = str(uuid.uuid4())
    cliente.get(
        f"/api/documentos/ficha/{atendimento['id']}/pdf?download=1",
        headers=autorizacao(
            token_operacional, **{"User-Agent": user_agent, "X-Real-IP": "177.44.1.2", "X-Dispositivo-Id": dispositivo}
        ),
    )
    [log] = _logs(app, banco_auditoria, user_agent)
    assert log["servico"] == "ms-docs"
    assert log["ip_cliente"] == "177.44.1.2"
    assert log["profissional_id"] == enfermeiro.id
    assert log["metodo"] == "GET"
    assert log["rota"] == f"/api/documentos/ficha/{atendimento['id']}/pdf"  # sem a query string
    assert log["status_code"] == 200
    assert log["tempo_ms"] >= 0
    assert str(log["dispositivo_id"]) == dispositivo
    assert log["data_hora"] is not None


def test_registra_recusas_e_erros(app, cliente, banco_auditoria, token_operacional):
    user_agent = f"teste-log/{uuid.uuid4()}"
    cliente.get("/api/documentos/email", headers={"User-Agent": user_agent})
    cliente.get("/api/documentos/email", headers=autorizacao(token_operacional, **{"User-Agent": user_agent}))
    cliente.get("/api/documentos/nada", headers={"User-Agent": user_agent, "X-Dispositivo-Id": "nao-e-uuid"})
    logs = _logs(app, banco_auditoria, user_agent)
    assert [(log["status_code"], log["rota"]) for log in logs] == [
        (401, "/api/documentos/email"),
        (403, "/api/documentos/email"),
        (404, "/api/documentos/nada"),
    ]
    # Sem token válido não há profissional; o 403 tinha token válido (de quem não é admin)
    assert logs[0]["profissional_id"] is None
    assert logs[1]["profissional_id"] is not None
    assert logs[2]["dispositivo_id"] is None
    # Sem o cabeçalho do Nginx, vale o IP da conexão
    assert logs[0]["ip_cliente"] == "testclient"


def test_auditoria_nao_aceita_alteracao(engine):
    """O ms_docs só pode inserir na auditoria: alterar ou apagar log é recusado pelo banco."""
    with pytest.raises(DBAPIError), engine.begin() as conexao:
        conexao.execute(text("UPDATE auditoria.log_acesso SET status_code = 200 WHERE servico = 'ms-docs'"))
    with pytest.raises(DBAPIError), engine.begin() as conexao:
        conexao.execute(text("DELETE FROM auditoria.log_acesso WHERE servico = 'ms-docs'"))


def test_registra_erro_inesperado(app, clinico, banco_auditoria, token_operacional):
    atendimento = clinico.novo_atendimento()
    user_agent = f"teste-log/{uuid.uuid4()}"
    clinico.quebrado = True
    try:
        # raise_server_exceptions=False: o teste recebe a resposta 500, como um cliente de verdade
        resposta = TestClient(app, raise_server_exceptions=False).get(
            f"/api/documentos/ficha/{atendimento['id']}/pdf",
            headers=autorizacao(token_operacional, **{"User-Agent": user_agent}),
        )
    finally:
        clinico.quebrado = False
    assert resposta.status_code == 500
    assert resposta.json() == {"erro": "ERRO_INTERNO", "mensagem": "Erro inesperado no servidor."}
    [log] = _logs(app, banco_auditoria, user_agent)
    assert log["status_code"] == 500
    assert log["profissional_id"] is not None
