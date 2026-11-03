"""A interface de envio que o serviço usa, independente do provedor de e-mail."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Anexo:
    nome: str
    tipo: str  # ex.: "application/pdf"
    conteudo: bytes = field(repr=False)


@dataclass(frozen=True)
class MensagemDeEmail:
    para: str
    assunto: str
    texto: str
    anexos: tuple[Anexo, ...] = ()


class FalhaNoEnvio(Exception):
    """O provedor recusou ou não respondeu. A mensagem é curta e vai para o pedido (coluna erro) e para a API."""


class EnvioDeEmail(ABC):
    @abstractmethod
    def enviar(self, mensagem: MensagemDeEmail) -> None:
        """Entrega a mensagem ao provedor ou lança FalhaNoEnvio."""


class EnvioDesativado(EnvioDeEmail):
    """Usado quando o SMTP não foi configurado: o pedido fica registrado com erro, nada é enviado de mentira."""

    def enviar(self, mensagem: MensagemDeEmail) -> None:
        raise FalhaNoEnvio("o envio de e-mail não está configurado no servidor (variáveis SMTP_* no infra/.env).")
