"""Conexão com o PostgreSQL e migrations (Alembic) do schema documentos."""

import logging
import time
from pathlib import Path

from alembic import command
from alembic.config import Config as ConfigAlembic
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import OperationalError

from .config import SERVICO, ConfigBanco

log = logging.getLogger(__name__)

PASTA_MIGRACOES = Path(__file__).resolve().parent.parent / "migracoes"


def criar_engine(config: ConfigBanco) -> Engine:
    return create_engine(
        config.url(),
        pool_size=5,
        max_overflow=5,
        pool_pre_ping=True,
        connect_args={"application_name": SERVICO, "connect_timeout": 5},
    )


def aguardar_banco(engine: Engine, tentativas: int = 30, intervalo_s: float = 2.0) -> None:
    """Na subida do Docker Compose o banco pode demorar um pouco para aceitar conexões."""
    for tentativa in range(1, tentativas + 1):
        try:
            with engine.connect() as conexao:
                conexao.execute(text("SELECT 1"))
            return
        except OperationalError as erro:
            if tentativa == tentativas:
                raise
            log.warning("banco ainda indisponível (tentativa %d de %d): %s", tentativa, tentativas, erro.orig)
            time.sleep(intervalo_s)


def configuracao_alembic() -> ConfigAlembic:
    config = ConfigAlembic()
    config.set_main_option("script_location", str(PASTA_MIGRACOES))
    return config


def aplicar_migracoes(engine: Engine) -> None:
    """Aplica as migrations pendentes. A trava evita duas instâncias migrando ao mesmo tempo."""
    config = configuracao_alembic()
    with engine.begin() as conexao:
        conexao.execute(text("SELECT pg_advisory_xact_lock(hashtext('ms-docs:migracoes'))"))
        config.attributes["connection"] = conexao
        command.upgrade(config, "head")
