"""Middleware de log de acesso exigido pelo enunciado (docs/08-seguranca-e-auditoria.md, seção 8.9).

Registra toda requisição HTTP com data/hora, IP do cliente, ID do profissional, método, rota, status
e tempo (ms). A gravação vai para outra thread depois da resposta: não atrasa a requisição e, se falhar,
só gera um aviso no log técnico do container.
"""

import logging
import re
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import Engine, text
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import SERVICO

log = logging.getLogger(__name__)

_FORMATO_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

# Sem RETURNING: o usuário ms_docs só tem permissão de INSERT na auditoria (D-04)
_INSERIR = text(
    """
    INSERT INTO auditoria.log_acesso
        (data_hora, servico, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms,
         dispositivo_id, user_agent)
    VALUES
        (:data_hora, :servico, :ip_cliente, :profissional_id, :metodo, :rota, :status_code, :tempo_ms,
         :dispositivo_id, :user_agent)
    """
)


@dataclass(frozen=True)
class LogAcesso:
    data_hora: datetime
    ip_cliente: str
    profissional_id: uuid.UUID | None
    metodo: str
    rota: str
    status_code: int
    tempo_ms: int
    dispositivo_id: uuid.UUID | None
    user_agent: str | None


class RegistradorDeAcessos:
    """Grava os logs numa thread separada, um de cada vez, na ordem em que chegaram."""

    def __init__(self, engine: Engine):
        self._engine = engine
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="log-acesso")
        self._pendentes: set[Future[None]] = set()
        self._trava = threading.Lock()

    def registrar(self, entrada: LogAcesso) -> None:
        try:
            futuro = self._executor.submit(self._gravar, entrada)
        except RuntimeError:  # o serviço está desligando
            log.warning("log de acesso descartado no desligamento: %s %s", entrada.metodo, entrada.rota)
            return
        with self._trava:
            self._pendentes.add(futuro)
        futuro.add_done_callback(self._concluido)

    def _concluido(self, futuro: Future[None]) -> None:
        with self._trava:
            self._pendentes.discard(futuro)

    def _gravar(self, entrada: LogAcesso) -> None:
        try:
            with self._engine.begin() as conexao:
                conexao.execute(
                    _INSERIR,
                    {
                        "data_hora": entrada.data_hora,
                        "servico": SERVICO,
                        "ip_cliente": entrada.ip_cliente,
                        "profissional_id": entrada.profissional_id,
                        "metodo": entrada.metodo,
                        "rota": entrada.rota,
                        "status_code": entrada.status_code,
                        "tempo_ms": entrada.tempo_ms,
                        "dispositivo_id": entrada.dispositivo_id,
                        "user_agent": entrada.user_agent,
                    },
                )
        except Exception:
            log.exception("falha ao gravar o log de acesso")

    def aguardar_pendentes(self, tempo_limite_s: float = 10.0) -> None:
        """Espera as gravações em andamento (usado nos testes e no desligamento)."""
        with self._trava:
            pendentes = list(self._pendentes)
        wait(pendentes, timeout=tempo_limite_s)

    def encerrar(self) -> None:
        self._executor.shutdown(wait=True)


def _cortar(texto: str | None, limite: int) -> str | None:
    return texto[:limite] if texto is not None else None


def uuid_ou_nada(texto: str | None) -> uuid.UUID | None:
    if texto and _FORMATO_UUID.match(texto.strip()):
        return uuid.UUID(texto.strip())
    return None


def _rota(scope: Scope) -> str:
    """O caminho como chegou (sem a query string), igual ao que o ms-auth e o ms-clinico gravam."""
    bruto = scope.get("raw_path")
    rota = bruto.decode("latin-1") if bruto else scope["path"]
    return _cortar(rota.split("?", 1)[0], 500) or "/"


class MiddlewareLogAcesso:
    """Middleware ASGI em volta de todo o app, inclusive da autenticação e do tratamento de erros."""

    def __init__(self, app: ASGIApp, registrador: RegistradorDeAcessos):
        self.app = app
        self.registrador = registrador

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        data_hora = datetime.now(UTC)
        inicio = time.perf_counter_ns()
        # A autenticação guarda aqui (request.state) o ID do profissional, se o token for válido
        estado = scope.setdefault("state", {})
        status = 500

        async def enviar(mensagem: Message) -> None:
            nonlocal status
            if mensagem["type"] == "http.response.start":
                status = mensagem["status"]
            await send(mensagem)

        try:
            await self.app(scope, receive, enviar)
        except Exception:
            status = 500
            raise
        finally:
            cabecalhos = Headers(scope=scope)
            # O Nginx preenche X-Real-IP com o IP de quem chamou. O serviço não fica exposto fora da
            # rede do Docker, então esse cabeçalho é confiável aqui.
            ip_real = (cabecalhos.get("x-real-ip") or "").strip()
            cliente = scope.get("client")
            self.registrador.registrar(
                LogAcesso(
                    data_hora=data_hora,
                    ip_cliente=ip_real or (cliente[0] if cliente else "desconhecido"),
                    profissional_id=estado.get("profissional_id"),
                    metodo=scope["method"],
                    rota=_rota(scope),
                    status_code=status,
                    tempo_ms=(time.perf_counter_ns() - inicio) // 1_000_000,
                    dispositivo_id=uuid_ou_nada(cabecalhos.get("x-dispositivo-id")),
                    user_agent=_cortar(cabecalhos.get("user-agent"), 300),
                )
            )
