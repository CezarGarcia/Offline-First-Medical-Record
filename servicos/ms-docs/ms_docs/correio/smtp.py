"""Adaptador SMTP (biblioteca padrão smtplib): converte a MensagemDeEmail e fala com o servidor (ex.: Gmail)."""

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid

from ..config import ConfigSmtp
from .envio import EnvioDeEmail, FalhaNoEnvio, MensagemDeEmail

log = logging.getLogger(__name__)


class EnvioPorSmtp(EnvioDeEmail):
    def __init__(self, config: ConfigSmtp):
        self._config = config

    def converter(self, mensagem: MensagemDeEmail) -> EmailMessage:
        email = EmailMessage()
        email["From"] = formataddr((self._config.nome_remetente, self._config.remetente))
        email["To"] = mensagem.para
        email["Subject"] = mensagem.assunto
        email["Date"] = formatdate(localtime=False, usegmt=True)
        email["Message-ID"] = make_msgid(domain=self._config.remetente.rpartition("@")[2] or None)
        email.set_content(mensagem.texto)
        for anexo in mensagem.anexos:
            principal, _, secundario = anexo.tipo.partition("/")
            email.add_attachment(anexo.conteudo, maintype=principal, subtype=secundario, filename=anexo.nome)
        return email

    def enviar(self, mensagem: MensagemDeEmail) -> None:
        email = self.converter(mensagem)
        config = self._config
        contexto = ssl.create_default_context()
        try:
            if config.seguranca == "SSL":
                conexao = smtplib.SMTP_SSL(config.host, config.porta, timeout=config.tempo_limite_s, context=contexto)
            else:
                conexao = smtplib.SMTP(config.host, config.porta, timeout=config.tempo_limite_s)
            with conexao:
                if config.seguranca == "STARTTLS":
                    conexao.starttls(context=contexto)
                if config.usuario:
                    conexao.login(config.usuario, config.senha or "")
                recusados = conexao.send_message(email)
        except smtplib.SMTPAuthenticationError as erro:
            log.error("SMTP recusou o login: %s", erro)
            raise FalhaNoEnvio(
                "o servidor de e-mail recusou o usuário ou a senha (confira SMTP_USUARIO e SMTP_SENHA)."
            ) from None
        except smtplib.SMTPRecipientsRefused as erro:
            log.warning("SMTP recusou o destinatário: %s", erro.recipients)
            raise FalhaNoEnvio("o servidor de e-mail recusou o endereço do destinatário.") from None
        except smtplib.SMTPResponseException as erro:
            log.warning("SMTP respondeu com erro: %s %s", erro.smtp_code, erro.smtp_error)
            raise FalhaNoEnvio(f"o servidor de e-mail recusou a mensagem (código {erro.smtp_code}).") from None
        except (smtplib.SMTPException, OSError) as erro:
            log.warning("falha ao falar com o servidor SMTP %s:%s: %s", config.host, config.porta, erro)
            raise FalhaNoEnvio("o servidor de e-mail não respondeu.") from None
        if recusados:
            raise FalhaNoEnvio("o servidor de e-mail recusou o endereço do destinatário.")
