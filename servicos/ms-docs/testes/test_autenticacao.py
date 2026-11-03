"""Nenhuma rota do ms-docs é pública (D-19): sem token válido, 401; rota de admin com perfil operacional, 403."""

import time
import uuid

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from .conftest import autorizacao

ROTAS = [
    ("GET", f"/api/documentos/ficha/{uuid.uuid4()}/pdf"),
    ("POST", f"/api/documentos/ficha/{uuid.uuid4()}/email"),
    ("GET", "/api/documentos/email"),
    ("GET", "/api/docs/ms-docs"),
]


@pytest.mark.parametrize(("metodo", "rota"), ROTAS)
def test_toda_rota_exige_token(cliente, metodo, rota):
    resposta = cliente.request(metodo, rota, json={"destinatario": {"tipo": "PACIENTE"}})
    assert resposta.status_code == 401
    assert resposta.json() == {
        "erro": "NAO_AUTENTICADO",
        "mensagem": "Token ausente, inválido ou vencido. Faça login novamente.",
    }


def test_token_vencido(cliente, emissor, enfermeiro):
    agora = int(time.time())
    token = emissor.token(enfermeiro, iat=agora - 1000, exp=agora - 10)
    assert cliente.get("/api/docs/ms-docs", headers=autorizacao(token)).status_code == 401


def test_token_de_outro_emissor_ou_publico(cliente, emissor, enfermeiro):
    for alteracao in ({"iss": "outro-servico"}, {"aud": "outro-sistema"}):
        token = emissor.token(enfermeiro, **alteracao)
        assert cliente.get("/api/docs/ms-docs", headers=autorizacao(token)).status_code == 401


def test_token_assinado_com_outra_chave(cliente, emissor, enfermeiro):
    outra = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = emissor.token(enfermeiro, chave=outra)
    assert cliente.get("/api/docs/ms-docs", headers=autorizacao(token)).status_code == 401


def test_token_sem_dados_do_profissional(cliente, emissor, enfermeiro):
    for faltando in ("sid", "tipoRegistro", "perfil", "exp"):
        token = emissor.token(enfermeiro, **{faltando: None})
        assert cliente.get("/api/docs/ms-docs", headers=autorizacao(token)).status_code == 401, faltando
    token = emissor.token(enfermeiro, tipoRegistro="OUTRO")
    assert cliente.get("/api/docs/ms-docs", headers=autorizacao(token)).status_code == 401


def test_cabecalho_sem_bearer(cliente, token_operacional):
    resposta = cliente.get("/api/docs/ms-docs", headers={"Authorization": f"Basic {token_operacional}"})
    assert resposta.status_code == 401


def test_historico_so_para_admin(cliente, token_operacional, token_admin):
    proibido = cliente.get("/api/documentos/email", headers=autorizacao(token_operacional))
    assert proibido.status_code == 403
    assert proibido.json()["erro"] == "PROIBIDO"
    assert cliente.get("/api/documentos/email", headers=autorizacao(token_admin)).status_code == 200


def test_especificacao_openapi(cliente, token_operacional):
    resposta = cliente.get("/api/docs/ms-docs", headers=autorizacao(token_operacional))
    assert resposta.status_code == 200
    especificacao = resposta.json()
    assert especificacao["info"]["title"] == "MedicalField — ms-docs"
    assert set(especificacao["paths"]) == {
        "/api/documentos/ficha/{id}/pdf",
        "/api/documentos/ficha/{id}/email",
        "/api/documentos/email",
    }
    assert especificacao["components"]["securitySchemes"]["bearer"]["scheme"] == "bearer"
    for operacoes in especificacao["paths"].values():
        for operacao in operacoes.values():
            assert operacao["security"] == [{"bearer": []}]
            # Validação documentada como 400 VALIDACAO, igual ao comportamento real
            assert "400" in operacao["responses"]
            assert "HTTPValidationError" not in str(operacao["responses"])
    # As rotas padrão do FastAPI ficam desligadas: nada aberto
    assert cliente.get("/docs").status_code == 404
    assert cliente.get("/openapi.json").status_code == 404


def test_rota_inexistente(cliente, token_operacional):
    resposta = cliente.get("/api/documentos/nada", headers=autorizacao(token_operacional))
    assert resposta.status_code == 404
    assert resposta.json()["erro"] == "NAO_ENCONTRADO"
    # Método errado numa rota que existe também é "rota não encontrada", como no ms-clinico
    assert cliente.delete("/api/documentos/email", headers=autorizacao(token_operacional)).status_code == 404
