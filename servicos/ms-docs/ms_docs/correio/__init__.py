"""Envio de e-mail (padrão Adapter, D-16).

O resto do serviço só conhece a interface `EnvioDeEmail` e a `MensagemDeEmail`. Quem fala o protocolo de
verdade é um adaptador: hoje o `EnvioPorSmtp` (Gmail). Trocar de provedor (por exemplo, uma API HTTP, se a VM
bloquear SMTP) é escrever outro adaptador, sem mexer nas rotas nem na regra de idempotência.
"""

from .envio import Anexo, EnvioDeEmail, EnvioDesativado, FalhaNoEnvio, MensagemDeEmail
from .smtp import EnvioPorSmtp

__all__ = ["Anexo", "EnvioDeEmail", "EnvioDesativado", "EnvioPorSmtp", "FalhaNoEnvio", "MensagemDeEmail"]
