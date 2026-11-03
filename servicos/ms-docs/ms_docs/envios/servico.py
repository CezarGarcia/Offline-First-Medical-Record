"""Regras da ficha em PDF e do envio por e-mail, com idempotência pelo ID do pedido (D-36)."""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Engine

from ..clinico import Chamada, ClienteClinico
from ..correio import EnvioDeEmail, FalhaNoEnvio
from ..erros import ErroApi
from ..ficha.construtor import FichaGerada, MontadorDaFicha
from ..ids import uuid7
from .mensagem import compor_mensagem
from .modelos import Destinatario, PedidoDeEmail
from .repositorio import Envio, RepositorioEnvios, Tentativa


class ServicoDeFichas:
    def __init__(self, clinico: ClienteClinico, montador: MontadorDaFicha, relogio: Callable[[], datetime]):
        self._clinico = clinico
        self._montador = montador
        self._relogio = relogio

    def dados(self, atendimento_id: uuid.UUID, chamada: Chamada) -> dict[str, Any]:
        return self._clinico.detalhe_do_atendimento(atendimento_id, chamada)

    def gerar(self, atendimento: dict[str, Any]) -> FichaGerada:
        return self._montador.montar(atendimento, self._relogio())

    def pdf(self, atendimento_id: uuid.UUID, chamada: Chamada) -> FichaGerada:
        return self.gerar(self.dados(atendimento_id, chamada))


def resolver_destinatario(destinatario: Destinatario, atendimento: dict[str, Any]) -> str:
    """O endereço de cada tipo de destinatário. Paciente e familiar usam o e-mail do cadastro da pessoa."""
    pessoa = atendimento.get("pessoa") or {}
    if destinatario.tipo == "PACIENTE":
        email = (pessoa.get("email") or "").strip()
        if not email:
            raise ErroApi.referencia(
                "PACIENTE_SEM_EMAIL", "O paciente não tem e-mail no cadastro. Escolha outro destinatário."
            )
        return email
    if destinatario.tipo == "FAMILIAR":
        email = ((pessoa.get("contato") or {}).get("email") or "").strip()
        if not email:
            raise ErroApi.referencia(
                "FAMILIAR_SEM_EMAIL", "O contato do familiar não tem e-mail no cadastro. Escolha outro destinatário."
            )
        return email
    return destinatario.email or ""


@dataclass(frozen=True)
class ResultadoDoEnvio:
    envio: Envio
    # True: o e-mail saiu nesta requisição (201). False: já tinha saído antes, nada foi reenviado (200).
    enviado_agora: bool


class ServicoDeEnvios:
    def __init__(
        self,
        engine: Engine,
        repositorio: RepositorioEnvios,
        fichas: ServicoDeFichas,
        envio_de_email: EnvioDeEmail,
        fuso: ZoneInfo,
    ):
        self._engine = engine
        self._repositorio = repositorio
        self._fichas = fichas
        self._envio = envio_de_email
        self._fuso = fuso

    def enviar_ficha(self, atendimento_id: uuid.UUID, pedido: PedidoDeEmail, chamada: Chamada) -> ResultadoDoEnvio:
        pedido.conferir()
        envio_id = pedido.id or uuid7()
        with self._engine.begin() as conexao:
            # Até o fim da transação, outro pedido com o mesmo ID espera aqui (e depois vê que já foi enviado)
            self._repositorio.travar(conexao, envio_id)
            existente = self._repositorio.buscar(conexao, envio_id)
            if existente is not None and existente.status == "ENVIADO":
                return ResultadoDoEnvio(existente, enviado_agora=False)

            # O primeiro pedido vale: numa nova tentativa, o atendimento e o destinatário são os da primeira vez
            alvo = existente.atendimento_id if existente else atendimento_id
            atendimento = self._fichas.dados(alvo, chamada)
            if existente is not None:
                tipo, para = existente.destinatario_tipo, existente.destinatario_email
            else:
                tipo, para = pedido.destinatario.tipo, resolver_destinatario(pedido.destinatario, atendimento)

            ficha = self._fichas.gerar(atendimento)
            erro: str | None = None
            try:
                self._envio.enviar(compor_mensagem(atendimento, para, ficha, chamada.profissional, self._fuso))
            except FalhaNoEnvio as falha:
                erro = str(falha)

            envio = self._repositorio.gravar_tentativa(
                conexao,
                Tentativa(
                    id=envio_id,
                    atendimento_id=alvo,
                    destinatario_tipo=tipo,
                    destinatario_email=para,
                    erro=erro[:1].upper() + erro[1:] if erro else None,
                    solicitado_por_id=chamada.profissional.id,
                    dispositivo_id=chamada.dispositivo_id,
                ),
            )
        # Fora da transação: o pedido com erro fica gravado e pode ser tentado de novo com o mesmo ID
        if erro is not None:
            raise ErroApi.falha_envio(erro)
        return ResultadoDoEnvio(envio, enviado_agora=True)

    def listar(self, atendimento_id: uuid.UUID | None, pagina: int, tamanho: int) -> tuple[list[Envio], int]:
        with self._engine.connect() as conexao:
            return self._repositorio.listar(conexao, atendimento_id, pagina, tamanho)


def agora_utc() -> datetime:
    return datetime.now(UTC)
