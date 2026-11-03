"""Monta o app FastAPI do ms-docs a partir das dependências (configuração real ou de teste)."""

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI
from sqlalchemy import Engine

from .auditoria import MiddlewareLogAcesso, RegistradorDeAcessos
from .clinico import ClienteClinico
from .correio import EnvioDeEmail
from .envios.repositorio import RepositorioEnvios
from .envios.servico import ServicoDeEnvios, ServicoDeFichas, agora_utc
from .erros import registrar_tratamento_de_erros
from .ficha.construtor import MontadorDaFicha
from .rotas import docs, documentos
from .seguranca import LeitorDeToken, profissional_autenticado


@dataclass
class Dependencias:
    engine: Engine
    leitor_de_token: LeitorDeToken
    clinico: ClienteClinico
    envio_de_email: EnvioDeEmail
    fuso: ZoneInfo
    relogio: Callable[[], datetime] = field(default=agora_utc)


def criar_app(dep: Dependencias) -> FastAPI:
    registrador = RegistradorDeAcessos(dep.engine)

    @asynccontextmanager
    async def ciclo_de_vida(_: FastAPI) -> AsyncIterator[None]:
        yield
        # Desligando: grava os últimos logs de acesso antes de sair
        registrador.aguardar_pendentes()
        registrador.encerrar()
        dep.clinico.fechar()

    app = FastAPI(
        title="MedicalField — ms-docs",
        description="PDF da ficha de atendimento e envio por e-mail. Contrato completo em docs/06-api.md.",
        version="1.0.0",
        # A especificação sai pela rota autenticada /api/docs/ms-docs (rotas/docs.py), nunca aberta
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
        # Nenhuma rota do ms-docs é pública (D-19)
        dependencies=[Depends(profissional_autenticado)],
        lifespan=ciclo_de_vida,
    )

    fichas = ServicoDeFichas(dep.clinico, MontadorDaFicha(dep.fuso), dep.relogio)
    app.state.leitor_de_token = dep.leitor_de_token
    app.state.registrador = registrador
    app.state.servico_de_fichas = fichas
    app.state.servico_de_envios = ServicoDeEnvios(dep.engine, RepositorioEnvios(), fichas, dep.envio_de_email, dep.fuso)

    registrar_tratamento_de_erros(app)
    app.include_router(documentos.rotas)
    app.include_router(docs.rotas)
    # Por fora de tudo: mede e registra até as requisições recusadas pela autenticação
    app.add_middleware(MiddlewareLogAcesso, registrador=registrador)
    app.openapi = lambda: docs.especificacao_openapi(app)  # type: ignore[method-assign]
    return app
