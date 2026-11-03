"""Confere o token de acesso (JWT RS256) com a chave pública do ms-auth. O ms-docs nunca emite token (D-06)."""

import uuid
from dataclasses import dataclass, field
from typing import Annotated

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import EMISSOR_TOKEN, PUBLICO_TOKEN
from .erros import ErroApi

TIPOS_REGISTRO = ("CRM", "COREN", "SOCORRISTA")
# O ms-auth emite com todos estes; um token sem algum deles não é aceito
CLAIMS_OBRIGATORIAS = ["iss", "aud", "sub", "exp", "iat", "sid", "tipoRegistro", "perfil"]


@dataclass(frozen=True)
class ProfissionalAutenticado:
    id: uuid.UUID
    sessao_id: uuid.UUID
    nome: str
    tipo_registro: str
    registro: str
    perfil: str
    # O token original, repassado ao ms-clinico quando o ms-docs busca a ficha em nome de quem pediu
    token: str = field(repr=False)

    @property
    def registro_completo(self) -> str:
        """Ex.: "CRM 12345-RS", como no bloco de origem dos registros."""
        return f"{self.tipo_registro} {self.registro}".strip()


class LeitorDeToken:
    def __init__(self, chave_publica_pem: str):
        try:
            chave = serialization.load_pem_public_key(chave_publica_pem.encode())
        except ValueError as erro:
            raise ValueError("A chave pública do JWT é inválida.") from erro
        if not isinstance(chave, rsa.RSAPublicKey):
            raise ValueError("A chave pública do JWT precisa ser RSA (o token é RS256).")
        self._chave = chave

    def ler(self, token: str) -> ProfissionalAutenticado:
        """Lança exceção se o token for inválido, de outra chave, de outro emissor ou vencido."""
        claims = jwt.decode(
            token,
            self._chave,
            algorithms=["RS256"],
            audience=PUBLICO_TOKEN,
            issuer=EMISSOR_TOKEN,
            options={"require": CLAIMS_OBRIGATORIAS},
        )
        tipo_registro = claims.get("tipoRegistro")
        if tipo_registro not in TIPOS_REGISTRO:
            raise ValueError("tipo de registro desconhecido no token")
        return ProfissionalAutenticado(
            id=uuid.UUID(str(claims["sub"])),
            sessao_id=uuid.UUID(str(claims["sid"])),
            nome=str(claims.get("nome") or ""),
            tipo_registro=tipo_registro,
            registro=str(claims.get("registro") or ""),
            # Na dúvida, o menor privilégio
            perfil="ADMIN" if claims.get("perfil") == "ADMIN" else "OPERACIONAL",
            token=token,
        )


_bearer = HTTPBearer(
    scheme_name="bearer",
    bearerFormat="JWT",
    description="Token de acesso do ms-auth (POST /api/auth/login).",
    auto_error=False,
)


def profissional_autenticado(
    request: Request,
    credenciais: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> ProfissionalAutenticado:
    """Exigida em TODA rota do ms-docs (D-19): este serviço não tem nenhuma rota pública."""
    if credenciais is None:
        raise ErroApi.nao_autenticado()
    leitor: LeitorDeToken = request.app.state.leitor_de_token
    try:
        profissional = leitor.ler(credenciais.credentials)
    except Exception:
        raise ErroApi.nao_autenticado() from None
    # O middleware de log de acesso lê daqui o ID de quem fez a requisição
    request.state.profissional_id = profissional.id
    return profissional


def somente_admin(
    profissional: Annotated[ProfissionalAutenticado, Depends(profissional_autenticado)],
) -> ProfissionalAutenticado:
    if profissional.perfil != "ADMIN":
        raise ErroApi.proibido()
    return profissional
