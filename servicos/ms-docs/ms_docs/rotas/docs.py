"""Especificação OpenAPI do ms-docs. É autenticada como todas as rotas (D-19); o Portal Admin mostra o
Swagger UI usando o token de quem está logado."""

from typing import Any

from fastapi import APIRouter, FastAPI, Request
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse

rotas = APIRouter()


@rotas.get("/api/docs/ms-docs", include_in_schema=False)
def especificacao(request: Request) -> JSONResponse:
    return JSONResponse(especificacao_openapi(request.app))


def especificacao_openapi(app: FastAPI) -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema
    esquema = get_openapi(title=app.title, version=app.version, description=app.description, routes=app.routes)
    # O FastAPI documenta erro de validação como 422; aqui ele vira 400 VALIDACAO (o mesmo dos outros serviços)
    for operacoes in esquema.get("paths", {}).values():
        for operacao in operacoes.values():
            respostas = operacao.get("responses", {})
            validacao = respostas.get("422", {})
            if "HTTPValidationError" in str(validacao.get("content", "")):
                del respostas["422"]
    componentes = esquema.get("components", {}).get("schemas", {})
    componentes.pop("HTTPValidationError", None)
    componentes.pop("ValidationError", None)
    app.openapi_schema = esquema
    return esquema
