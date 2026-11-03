"""Configuração lida das variáveis de ambiente (as mesmas do infra/.env e do docker-compose.yml)."""

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from email.utils import parseaddr
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import URL

SERVICO = "ms-docs"
EMISSOR_TOKEN = "medicalfield-auth"
PUBLICO_TOKEN = "medicalfield"

SEGURANCAS_SMTP = ("STARTTLS", "SSL", "NENHUMA")


class ErroDeConfiguracao(Exception):
    """Configuração ausente ou inválida: o serviço não sobe."""


@dataclass(frozen=True)
class ConfigBanco:
    host: str
    porta: int
    nome: str
    usuario: str
    senha: str = field(repr=False)

    def url(self) -> URL:
        return URL.create(
            "postgresql+psycopg",
            username=self.usuario,
            password=self.senha,
            host=self.host,
            port=self.porta,
            database=self.nome,
        )


@dataclass(frozen=True)
class ConfigSmtp:
    host: str
    porta: int
    usuario: str | None
    senha: str | None = field(repr=False)
    remetente: str
    # STARTTLS (porta 587, o caso do Gmail), SSL (porta 465) ou NENHUMA (servidor de teste local)
    seguranca: str
    tempo_limite_s: float = 20.0
    nome_remetente: str = "MedicalField"


@dataclass(frozen=True)
class Config:
    porta: int
    banco: ConfigBanco
    chave_publica_pem: str = field(repr=False)
    url_clinico: str
    smtp: ConfigSmtp | None
    fuso: ZoneInfo


def _obrigatoria(env: Mapping[str, str], nome: str) -> str:
    valor = env.get(nome, "").strip()
    if not valor:
        raise ErroDeConfiguracao(f"A variável de ambiente {nome} não foi definida.")
    return valor


def _inteiro(env: Mapping[str, str], nome: str, padrao: int) -> int:
    texto = env.get(nome, "").strip()
    if not texto:
        return padrao
    try:
        return int(texto)
    except ValueError:
        raise ErroDeConfiguracao(f"A variável de ambiente {nome} precisa ser um número (veio {texto!r}).") from None


def config_banco(env: Mapping[str, str] = os.environ) -> ConfigBanco:
    return ConfigBanco(
        host=env.get("DB_HOST", "localhost"),
        porta=_inteiro(env, "DB_PORTA", 5432),
        nome=env.get("DB_NOME", "medicalfield"),
        usuario=env.get("DB_USUARIO", "ms_docs"),
        senha=_obrigatoria(env, "DB_SENHA"),
    )


def config_smtp(env: Mapping[str, str] = os.environ) -> ConfigSmtp | None:
    """Sem SMTP_HOST o envio de e-mail fica desligado (a rota responde 502 explicando o motivo)."""
    host = env.get("SMTP_HOST", "").strip()
    if not host:
        return None
    porta = _inteiro(env, "SMTP_PORTA", 587)
    usuario = env.get("SMTP_USUARIO", "").strip() or None
    senha = env.get("SMTP_SENHA", "")
    # A senha de app do Gmail aparece em grupos de 4 letras separados por espaço; os espaços não fazem parte dela
    senha = senha.replace(" ", "") or None
    # Aceita "conta@gmail.com" ou "Nome <conta@gmail.com>"
    nome_remetente, remetente = parseaddr(env.get("SMTP_REMETENTE", "").strip() or (usuario or ""))
    if "@" not in remetente:
        raise ErroDeConfiguracao("Defina SMTP_REMETENTE (ou SMTP_USUARIO) com o endereço que aparece como remetente.")
    seguranca = env.get("SMTP_SEGURANCA", "").strip().upper() or ("SSL" if porta == 465 else "STARTTLS")
    if seguranca not in SEGURANCAS_SMTP:
        raise ErroDeConfiguracao(f"SMTP_SEGURANCA precisa ser um destes: {', '.join(SEGURANCAS_SMTP)}.")
    if usuario and not senha:
        raise ErroDeConfiguracao("SMTP_USUARIO foi definido sem SMTP_SENHA.")
    return ConfigSmtp(
        host=host,
        porta=porta,
        usuario=usuario,
        senha=senha,
        remetente=remetente,
        seguranca=seguranca,
        nome_remetente=nome_remetente or "MedicalField",
    )


def _ler_chave(caminho: str) -> str:
    try:
        return Path(caminho).read_text(encoding="utf-8")
    except OSError:
        raise ErroDeConfiguracao(
            f"Não foi possível ler a chave pública do JWT em {caminho}. "
            "Gere as chaves com infra/scripts/gerar-chaves-jwt.sh."
        ) from None


def carregar_config(env: Mapping[str, str] = os.environ) -> Config:
    return Config(
        porta=_inteiro(env, "PORTA", 8000),
        banco=config_banco(env),
        chave_publica_pem=_ler_chave(env.get("JWT_CHAVE_PUBLICA_ARQUIVO", "/run/secrets/jwt-publica.pem")),
        url_clinico=env.get("MS_CLINICO_URL", "http://ms-clinico:8080").rstrip("/"),
        smtp=config_smtp(env),
        fuso=ZoneInfo(env.get("FUSO_HORARIO", "America/Sao_Paulo")),
    )
