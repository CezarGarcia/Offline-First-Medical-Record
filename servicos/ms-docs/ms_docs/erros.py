"""Formato padrão de erro dos três serviços: {erro, mensagem, detalhes} (docs/06-api.md, seção 6.5)."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException


class ErroApi(Exception):
    """Erro de negócio que vira a resposta padrão da API."""

    def __init__(self, status: int, codigo: str, mensagem: str, detalhes: list[dict[str, str]] | None = None):
        super().__init__(mensagem)
        self.status = status
        self.codigo = codigo
        self.mensagem = mensagem
        self.detalhes = detalhes or []

    def corpo(self) -> dict[str, Any]:
        corpo: dict[str, Any] = {"erro": self.codigo, "mensagem": self.mensagem}
        if self.detalhes:
            corpo["detalhes"] = self.detalhes
        return corpo

    @classmethod
    def validacao(cls, detalhes: list[dict[str, str]]) -> "ErroApi":
        return cls(400, "VALIDACAO", "Há campos inválidos.", detalhes)

    @classmethod
    def nao_autenticado(cls) -> "ErroApi":
        return cls(401, "NAO_AUTENTICADO", "Token ausente, inválido ou vencido. Faça login novamente.")

    @classmethod
    def proibido(cls) -> "ErroApi":
        return cls(403, "PROIBIDO", "Esta rota é restrita a administradores.")

    @classmethod
    def nao_encontrado(cls, mensagem: str) -> "ErroApi":
        return cls(404, "NAO_ENCONTRADO", mensagem)

    @classmethod
    def referencia(cls, codigo: str, mensagem: str) -> "ErroApi":
        """422: o pedido está bem formado, mas falta um dado que ele depende (ex.: o e-mail do paciente)."""
        return cls(422, codigo, mensagem)

    @classmethod
    def falha_envio(cls, motivo: str) -> "ErroApi":
        return cls(502, "FALHA_ENVIO_EMAIL", f"Não foi possível enviar o e-mail: {motivo} Tente de novo mais tarde.")

    @classmethod
    def servico_indisponivel(cls, mensagem: str) -> "ErroApi":
        return cls(503, "SERVICO_INDISPONIVEL", mensagem)


def _lista_de_valores(esperado: str) -> str:
    """ "'PACIENTE', 'FAMILIAR' or 'OUTRO'" vira "PACIENTE, FAMILIAR, OUTRO"."""
    return esperado.replace("'", "").replace(" or ", ", ")


def _mensagem_de_validacao(erro: dict[str, Any]) -> str:
    tipo = erro.get("type", "")
    ctx = erro.get("ctx") or {}
    match tipo:
        case "missing":
            return "campo obrigatório"
        case "extra_forbidden":
            return "campo não permitido"
        case "uuid_parsing" | "uuid_type" | "uuid_version":
            return "formato inválido (esperado: uuid)"
        case "literal_error" | "enum":
            return f"valor não permitido (use: {_lista_de_valores(str(ctx.get('expected', '')))})"
        case "string_type":
            return "tipo inválido (esperado: texto)"
        case "string_too_long":
            return f"muito longo (máximo {ctx.get('max_length')} caracteres)"
        case "string_too_short":
            return f"muito curto (mínimo {ctx.get('min_length')} caracteres)"
        case "int_parsing" | "int_type" | "int_from_float":
            return "tipo inválido (esperado: inteiro)"
        case "greater_than_equal":
            return f"menor que o mínimo permitido ({ctx.get('ge')})"
        case "less_than_equal":
            return f"maior que o máximo permitido ({ctx.get('le')})"
        case "model_attributes_type" | "dict_type" | "model_type":
            return "tipo inválido (esperado: objeto)"
        case "json_invalid":
            return "JSON inválido"
        case "value_error":
            return str(ctx.get("error", erro.get("msg", "valor inválido")))
        case _:
            return str(erro.get("msg", "valor inválido"))


def _nome_do_campo(erro: dict[str, Any]) -> str:
    """('body', 'destinatario', 'email') vira "destinatario.email", como nos outros serviços."""
    local = list(erro.get("loc", ()))
    if local and local[0] in ("body", "query", "path", "header"):
        local = local[1:]
    if erro.get("type") == "json_invalid":
        return "corpo"
    return ".".join(str(parte) for parte in local) or "corpo"


def detalhes_de_validacao(erros: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [{"campo": _nome_do_campo(e), "mensagem": _mensagem_de_validacao(e)} for e in erros]


def registrar_tratamento_de_erros(app: FastAPI) -> None:
    @app.exception_handler(ErroApi)
    async def erro_api(_: Request, erro: ErroApi) -> JSONResponse:
        return JSONResponse(erro.corpo(), status_code=erro.status)

    @app.exception_handler(RequestValidationError)
    async def validacao(_: Request, erro: RequestValidationError) -> JSONResponse:
        return JSONResponse(ErroApi.validacao(detalhes_de_validacao(list(erro.errors()))).corpo(), status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def http(_: Request, erro: StarletteHTTPException) -> JSONResponse:
        if erro.status_code in (404, 405):
            return JSONResponse({"erro": "NAO_ENCONTRADO", "mensagem": "Rota não encontrada."}, status_code=404)
        if 400 <= erro.status_code < 500:
            return JSONResponse({"erro": "VALIDACAO", "mensagem": "Requisição inválida."}, status_code=400)
        return JSONResponse({"erro": "ERRO_INTERNO", "mensagem": "Erro inesperado no servidor."}, status_code=500)

    @app.exception_handler(Exception)
    async def inesperado(_: Request, erro: Exception) -> JSONResponse:
        # O Starlette repassa a exceção ao Uvicorn depois desta resposta, e ele registra o erro completo no log
        return JSONResponse({"erro": "ERRO_INTERNO", "mensagem": "Erro inesperado no servidor."}, status_code=500)


class DetalheDeErro(BaseModel):
    campo: str
    mensagem: str


class RespostaDeErro(BaseModel):
    """Só para a documentação (OpenAPI): o formato de todas as respostas de erro."""

    erro: str
    mensagem: str
    detalhes: list[DetalheDeErro] | None = None
