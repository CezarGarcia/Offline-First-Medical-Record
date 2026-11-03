"""Ambiente dos testes do ms-docs.

- Banco: o PostgreSQL de verdade do infra/ (variáveis DB_HOST, DB_PORTA, DB_SENHA do usuário ms_docs e
  MS_AUTH_DB_SENHA, usada só para ler a auditoria, onde o ms_docs só pode inserir).
- Tokens: um par de chaves RSA gerado na hora; os tokens são assinados aqui, como o ms-auth faria.
- ms-clinico: falso (httpx.MockTransport), devolvendo atendimentos no formato real (dados/atendimento_completo.json).
- E-mail: um servidor SMTP de verdade (aiosmtpd) rodando nesta máquina, que guarda as mensagens recebidas.
"""

import asyncio
import copy
import email
import email.policy
import json
import os
import re
import socket
import time
import uuid
from collections.abc import Iterator
from email.message import EmailMessage
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import jwt
import pytest
from aiosmtpd.controller import Controller
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text

from ms_docs.banco import aplicar_migracoes, criar_engine
from ms_docs.clinico import ClienteClinico
from ms_docs.config import ConfigBanco, ConfigSmtp
from ms_docs.correio import EnvioPorSmtp
from ms_docs.principal import Dependencias, criar_app
from ms_docs.seguranca import LeitorDeToken

PASTA_DADOS = Path(__file__).parent / "dados"
FUSO = ZoneInfo("America/Sao_Paulo")


def _variavel(nome: str) -> str:
    valor = os.environ.get(nome)
    if not valor:
        pytest.exit(f"Defina {nome} para rodar os testes (ver servicos/ms-docs/README.md).", returncode=2)
    return valor


def _config_banco(usuario: str, senha: str) -> ConfigBanco:
    return ConfigBanco(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        porta=int(os.environ.get("DB_PORTA", "5433")),
        nome=os.environ.get("DB_NOME", "medicalfield"),
        usuario=usuario,
        senha=senha,
    )


# ---------------------------------------------------------------- tokens


class Emissor:
    """Assina tokens como o ms-auth (RS256, mesmo emissor, público e claims)."""

    def __init__(self) -> None:
        self.privada = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.publica_pem = (
            self.privada.public_key()
            .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
            .decode()
        )

    def token(self, profissional: "Profissional", chave: Any = None, **alteracoes: Any) -> str:
        agora = int(time.time())
        claims: dict[str, Any] = {
            "iss": "medicalfield-auth",
            "aud": "medicalfield",
            "sub": str(profissional.id),
            "sid": str(uuid.uuid4()),
            "jti": str(uuid.uuid4()),
            "iat": agora,
            "exp": agora + 900,
            "nome": profissional.nome,
            "tipoRegistro": profissional.tipo_registro,
            "registro": profissional.registro,
            "perfil": profissional.perfil,
        }
        claims.update(alteracoes)
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode(claims, chave or self.privada, algorithm="RS256")


class Profissional:
    def __init__(self, nome: str, tipo_registro: str, registro: str, perfil: str):
        self.id = uuid.uuid4()
        self.nome = nome
        self.tipo_registro = tipo_registro
        self.registro = registro
        self.perfil = perfil


@pytest.fixture(scope="session")
def emissor() -> Emissor:
    return Emissor()


@pytest.fixture(scope="session")
def enfermeiro() -> Profissional:
    return Profissional("Enf. Teste", "COREN", "999001-RS", "OPERACIONAL")


@pytest.fixture(scope="session")
def admin() -> Profissional:
    return Profissional("Dr. Admin Teste", "CRM", "99002-RS", "ADMIN")


@pytest.fixture(scope="session")
def token_operacional(emissor: Emissor, enfermeiro: Profissional) -> str:
    return emissor.token(enfermeiro)


@pytest.fixture(scope="session")
def token_admin(emissor: Emissor, admin: Profissional) -> str:
    return emissor.token(admin)


# ---------------------------------------------------------------- ms-clinico falso


class ClinicoFalso:
    def __init__(self) -> None:
        self.atendimentos: dict[str, dict[str, Any]] = {}
        self.fora_do_ar = False
        # Responde 200 com algo que não é JSON: força um erro inesperado no ms-docs
        self.quebrado = False
        self.chamadas: list[httpx.Request] = []

    def __call__(self, requisicao: httpx.Request) -> httpx.Response:
        self.chamadas.append(requisicao)
        if self.fora_do_ar:
            raise httpx.ConnectError("conexão recusada", request=requisicao)
        if self.quebrado:
            return httpx.Response(200, text="<html>não é JSON</html>")
        if not requisicao.headers.get("authorization", "").startswith("Bearer "):
            return httpx.Response(401, json={"erro": "NAO_AUTENTICADO", "mensagem": "sem token"})
        achado = re.fullmatch(r"/api/atendimento/detalhe/([0-9a-f-]{36})", requisicao.url.path)
        dados = self.atendimentos.get(achado[1]) if achado else None
        if dados is None:
            return httpx.Response(404, json={"erro": "NAO_ENCONTRADO", "mensagem": "Atendimento não encontrado."})
        return httpx.Response(200, json=dados)

    def novo_atendimento(self, **alteracoes: Any) -> dict[str, Any]:
        """Uma cópia do atendimento completo com IDs novos (cada teste usa o seu)."""
        dados = atendimento_completo()
        dados["id"] = str(uuid.uuid4())
        for chave, valor in alteracoes.items():
            if isinstance(valor, dict) and isinstance(dados.get(chave), dict):
                dados[chave] = {**dados[chave], **valor}
            else:
                dados[chave] = valor
        self.atendimentos[dados["id"]] = dados
        return dados


def atendimento_completo() -> dict[str, Any]:
    return copy.deepcopy(json.loads((PASTA_DADOS / "atendimento_completo.json").read_text(encoding="utf-8")))


@pytest.fixture(scope="session")
def clinico() -> ClinicoFalso:
    return ClinicoFalso()


# ---------------------------------------------------------------- SMTP de teste


class CaixaDeEntrada:
    """Servidor SMTP local: guarda as mensagens. Pode recusar ou demorar, para simular falhas."""

    def __init__(self) -> None:
        self.mensagens: list[EmailMessage] = []
        self.recusar = False
        self.atraso_s = 0.0

    async def handle_DATA(self, server: Any, session: Any, envelope: Any) -> str:
        if self.atraso_s:
            await asyncio.sleep(self.atraso_s)
        if self.recusar:
            return "451 4.3.0 Falha temporária simulada"
        mensagem = email.message_from_bytes(envelope.content, policy=email.policy.default)
        self.mensagens.append(mensagem)  # type: ignore[arg-type]
        return "250 OK"

    def para(self, endereco: str) -> list[EmailMessage]:
        return [m for m in self.mensagens if m["To"] == endereco]


def porta_livre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def caixa() -> Iterator[CaixaDeEntrada]:
    caixa = CaixaDeEntrada()
    controlador = Controller(caixa, hostname="127.0.0.1", port=porta_livre())
    controlador.start()
    caixa.porta = controlador.port  # type: ignore[attr-defined]
    yield caixa
    controlador.stop()


@pytest.fixture(autouse=True)
def caixa_normal(caixa: CaixaDeEntrada) -> None:
    caixa.recusar = False
    caixa.atraso_s = 0.0


# ---------------------------------------------------------------- banco e app


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    engine = criar_engine(_config_banco("ms_docs", _variavel("DB_SENHA")))
    aplicar_migracoes(engine)
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def banco_auditoria() -> Iterator[Engine]:
    """Conexão como ms_auth (dono da auditoria), só para conferir o que o middleware gravou."""
    engine = create_engine(_config_banco("ms_auth", _variavel("MS_AUTH_DB_SENHA")).url())
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def app(engine: Engine, emissor: Emissor, clinico: ClinicoFalso, caixa: CaixaDeEntrada) -> FastAPI:
    smtp = ConfigSmtp(
        host="127.0.0.1",
        porta=caixa.porta,  # type: ignore[attr-defined]
        usuario=None,
        senha=None,
        remetente="medicalfield@exemplo.com",
        seguranca="NENHUMA",
        tempo_limite_s=5,
    )
    return criar_app(
        Dependencias(
            engine=engine,
            leitor_de_token=LeitorDeToken(emissor.publica_pem),
            clinico=ClienteClinico("http://ms-clinico:8080", transporte=httpx.MockTransport(clinico)),
            envio_de_email=EnvioPorSmtp(smtp),
            fuso=FUSO,
        )
    )


@pytest.fixture(scope="session")
def cliente(app: FastAPI, engine: Engine, enfermeiro: Profissional, admin: Profissional) -> Iterator[TestClient]:
    with TestClient(app) as cliente:
        yield cliente
    # O que os testes criaram sai do banco; os logs ficam (a auditoria não aceita exclusão)
    with engine.begin() as conexao:
        conexao.execute(
            text("DELETE FROM documentos.envio_email WHERE solicitado_por_id IN (:a, :b)"),
            {"a": enfermeiro.id, "b": admin.id},
        )


def autorizacao(token: str, **outros: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", **outros}
