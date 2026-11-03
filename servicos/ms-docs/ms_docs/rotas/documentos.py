"""Rotas do ms-docs (docs/06-api.md, seção 6.10). Todas exigem token (dependência global do app)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, Response

from ..auditoria import uuid_ou_nada
from ..clinico import Chamada
from ..envios.modelos import EnvioSaida, PaginaDeEnvios, PedidoDeEmail
from ..envios.servico import ServicoDeEnvios, ServicoDeFichas
from ..erros import RespostaDeErro
from ..seguranca import ProfissionalAutenticado, profissional_autenticado, somente_admin

rotas = APIRouter(prefix="/api/documentos", tags=["Documentos"])

_DESCRICAO_DOS_ERROS = {
    400: "VALIDACAO: campo faltando ou inválido",
    401: "NAO_AUTENTICADO: sem token, ou token inválido ou vencido",
    403: "PROIBIDO: rota só para administradores",
    404: "NAO_ENCONTRADO: o atendimento não existe (ou ainda não foi sincronizado)",
    422: "PACIENTE_SEM_EMAIL ou FAMILIAR_SEM_EMAIL: o destinatário escolhido não tem e-mail no cadastro",
    502: "FALHA_ENVIO_EMAIL: o e-mail não saiu (o pedido fica registrado e pode ser repetido)",
    503: "SERVICO_INDISPONIVEL: o ms-clinico não respondeu",
}


def _erros(*codigos: int) -> dict[int | str, dict[str, Any]]:
    return {c: {"model": RespostaDeErro, "description": _DESCRICAO_DOS_ERROS[c]} for c in codigos}


def chamada_atual(
    request: Request, profissional: Annotated[ProfissionalAutenticado, Depends(profissional_autenticado)]
) -> Chamada:
    ip_real = (request.headers.get("x-real-ip") or "").strip()
    return Chamada(
        profissional=profissional,
        ip_cliente=ip_real or (request.client.host if request.client else "desconhecido"),
        dispositivo_id=uuid_ou_nada(request.headers.get("x-dispositivo-id")),
    )


def servico_de_fichas(request: Request) -> ServicoDeFichas:
    return request.app.state.servico_de_fichas


def servico_de_envios(request: Request) -> ServicoDeEnvios:
    return request.app.state.servico_de_envios


@rotas.get(
    "/ficha/{id}/pdf",
    summary="Gera e baixa o PDF da ficha de atendimento",
    description="`{id}` é o ID do atendimento. Os dados vêm do ms-clinico, com o token de quem pediu.",
    response_class=Response,
    responses={
        200: {"content": {"application/pdf": {}}, "description": "O PDF da ficha"},
        **_erros(400, 401, 404, 503),
    },
)
def baixar_pdf(
    id: uuid.UUID,
    chamada: Annotated[Chamada, Depends(chamada_atual)],
    fichas: Annotated[ServicoDeFichas, Depends(servico_de_fichas)],
) -> Response:
    ficha = fichas.pdf(id, chamada)
    return Response(
        content=ficha.pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{ficha.nome_do_arquivo}"',
            # Dado de saúde: nenhum cache guarda uma cópia
            "Cache-Control": "no-store",
        },
    )


@rotas.post(
    "/ficha/{id}/email",
    summary="Envia a ficha em PDF por e-mail",
    description=(
        "`{id}` é o ID do atendimento. O `id` do corpo é a chave de idempotência: repetir o pedido com o mesmo ID "
        "devolve o resultado (200) sem mandar outro e-mail; se da vez anterior deu erro, tenta de novo com o mesmo "
        "destinatário da primeira vez."
    ),
    status_code=201,
    response_model=EnvioSaida,
    responses={
        200: {"model": EnvioSaida, "description": "Repetição: esse pedido já tinha sido enviado; nada foi reenviado"},
        201: {"description": "E-mail enviado nesta requisição"},
        **_erros(400, 401, 404, 422, 502, 503),
    },
)
def enviar_por_email(
    id: uuid.UUID,
    pedido: PedidoDeEmail,
    chamada: Annotated[Chamada, Depends(chamada_atual)],
    envios: Annotated[ServicoDeEnvios, Depends(servico_de_envios)],
) -> JSONResponse:
    resultado = envios.enviar_ficha(id, pedido, chamada)
    corpo = EnvioSaida.model_validate(resultado.envio).model_dump(mode="json", by_alias=True)
    return JSONResponse(corpo, status_code=201 if resultado.enviado_agora else 200)


@rotas.get(
    "/email",
    summary="Histórico de envios por e-mail (admin)",
    description="Do pedido mais recente para o mais antigo.",
    response_model=PaginaDeEnvios,
    dependencies=[Depends(somente_admin)],
    responses=_erros(400, 401, 403),
)
def historico_de_envios(
    envios: Annotated[ServicoDeEnvios, Depends(servico_de_envios)],
    atendimento_id: Annotated[uuid.UUID | None, Query(alias="atendimentoId")] = None,
    pagina: Annotated[int, Query(ge=1)] = 1,
    tamanho: Annotated[int, Query(ge=1, le=200)] = 50,
) -> PaginaDeEnvios:
    itens, total = envios.listar(atendimento_id, pagina, tamanho)
    return PaginaDeEnvios(
        itens=[EnvioSaida.model_validate(item) for item in itens], pagina=pagina, tamanho=tamanho, total=total
    )
