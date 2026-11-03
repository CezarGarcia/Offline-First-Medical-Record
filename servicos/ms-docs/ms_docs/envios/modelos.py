"""Formatos de entrada e saída das rotas de e-mail (docs/06-api.md, seção 6.10)."""

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel
from pydantic_core import PydanticCustomError

from ..erros import ErroApi

# Algo@algo.algo, sem espaços nem quebras de linha (o mesmo critério do formulário do cliente)
FORMATO_EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")

TipoDestinatario = Literal["PACIENTE", "FAMILIAR", "OUTRO"]
StatusEnvio = Literal["ENVIADO", "ERRO"]


class Destinatario(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: TipoDestinatario = Field(
        description="PACIENTE (e-mail da pessoa), FAMILIAR (e-mail do contato) ou OUTRO (exige o campo email)."
    )
    email: str | None = Field(default=None, max_length=200, description="Só quando o tipo é OUTRO.")

    @field_validator("email")
    @classmethod
    def formato_do_email(cls, valor: str | None) -> str | None:
        if valor is None:
            return None
        valor = valor.strip()
        if not FORMATO_EMAIL.fullmatch(valor):
            raise PydanticCustomError("email", "formato inválido (esperado: email)")
        return valor


class PedidoDeEmail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = Field(
        default=None,
        description="Chave de idempotência gerada por quem pede. O mesmo ID nunca manda dois e-mails. "
        "Se não vier, o servidor gera um (sem proteção contra repetição).",
    )
    destinatario: Destinatario

    def conferir(self) -> None:
        """Regra entre campos: o e-mail informado só vale (e é obrigatório) para o tipo OUTRO."""
        if self.destinatario.tipo == "OUTRO" and not self.destinatario.email:
            raise ErroApi.validacao([{"campo": "destinatario.email", "mensagem": "obrigatório quando o tipo é OUTRO"}])
        if self.destinatario.tipo != "OUTRO" and self.destinatario.email:
            raise ErroApi.validacao(
                [{"campo": "destinatario.email", "mensagem": "só pode ser informado quando o tipo é OUTRO"}]
            )


class ModeloDeSaida(BaseModel):
    """Campos em snake_case no Python e em camelCase no JSON, como nos outros serviços."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class EnvioSaida(ModeloDeSaida):
    id: uuid.UUID
    atendimento_id: uuid.UUID
    status: StatusEnvio
    destinatario_tipo: TipoDestinatario
    destinatario_email: str
    erro: str | None
    tentativas: int
    solicitado_por_id: uuid.UUID
    dispositivo_id: uuid.UUID | None
    solicitado_em: datetime
    ultima_tentativa_em: datetime
    enviado_em: datetime | None


class PaginaDeEnvios(ModeloDeSaida):
    itens: list[EnvioSaida]
    pagina: int
    tamanho: int
    total: int
