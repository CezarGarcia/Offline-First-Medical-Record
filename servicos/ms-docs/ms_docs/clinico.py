"""Cliente HTTP do ms-clinico: o ms-docs busca a ficha completa lá, em nome de quem pediu."""

import logging
import uuid
from dataclasses import dataclass
from typing import Any

import httpx

from .erros import ErroApi
from .seguranca import ProfissionalAutenticado

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Chamada:
    """Quem fez a requisição ao ms-docs. Vai junto nas chamadas internas (mesmo token, IP e dispositivo)."""

    profissional: ProfissionalAutenticado
    ip_cliente: str
    dispositivo_id: uuid.UUID | None


class ClienteClinico:
    def __init__(self, url_base: str, tempo_limite_s: float = 10.0, transporte: httpx.BaseTransport | None = None):
        self._http = httpx.Client(
            base_url=url_base,
            timeout=tempo_limite_s,
            transport=transporte,
            headers={"User-Agent": "ms-docs"},
        )

    def detalhe_do_atendimento(self, atendimento_id: uuid.UUID, chamada: Chamada) -> dict[str, Any]:
        """O atendimento completo (com pessoa, prontuário e medicamentos), como o ms-clinico devolve."""
        cabecalhos = {
            "Authorization": f"Bearer {chamada.profissional.token}",
            # O ms-clinico registra no log de acesso dele quem está por trás desta chamada
            "X-Real-IP": chamada.ip_cliente,
        }
        if chamada.dispositivo_id:
            cabecalhos["X-Dispositivo-Id"] = str(chamada.dispositivo_id)
        try:
            resposta = self._http.get(f"/api/atendimento/detalhe/{atendimento_id}", headers=cabecalhos)
        except httpx.HTTPError as erro:
            log.warning("ms-clinico não respondeu: %s", erro)
            raise ErroApi.servico_indisponivel(
                "O ms-clinico (dados dos atendimentos) não respondeu. Tente novamente em instantes."
            ) from None

        if resposta.status_code == 200:
            return resposta.json()
        if resposta.status_code == 404:
            raise ErroApi.nao_encontrado(
                "Atendimento não encontrado. Se ele foi registrado offline, sincronize antes de gerar a ficha."
            )
        if resposta.status_code == 401:
            raise ErroApi.nao_autenticado()
        log.error("resposta inesperada do ms-clinico: %s %s", resposta.status_code, resposta.text[:300])
        raise ErroApi.servico_indisponivel(
            "O ms-clinico (dados dos atendimentos) respondeu com erro. Tente novamente em instantes."
        )

    def fechar(self) -> None:
        self._http.close()
