"""Ponto de entrada do container: `python -m ms_docs`."""

import logging
import sys

import uvicorn

from .banco import aguardar_banco, aplicar_migracoes, criar_engine
from .clinico import ClienteClinico
from .config import ErroDeConfiguracao, carregar_config
from .correio import EnvioDesativado, EnvioPorSmtp
from .principal import Dependencias, criar_app
from .seguranca import LeitorDeToken

log = logging.getLogger("ms_docs")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        config = carregar_config()
        leitor = LeitorDeToken(config.chave_publica_pem)
    except (ErroDeConfiguracao, ValueError) as erro:
        log.error("%s", erro)
        sys.exit(1)

    engine = criar_engine(config.banco)
    aguardar_banco(engine)
    aplicar_migracoes(engine)

    if config.smtp is None:
        log.warning("SMTP_HOST não foi definido: o envio de e-mail está desligado (a rota responde 502).")
        envio = EnvioDesativado()
    else:
        log.info("e-mail pelo SMTP %s:%s (%s)", config.smtp.host, config.smtp.porta, config.smtp.seguranca)
        envio = EnvioPorSmtp(config.smtp)

    app = criar_app(
        Dependencias(
            engine=engine,
            leitor_de_token=leitor,
            clinico=ClienteClinico(config.url_clinico),
            envio_de_email=envio,
            fuso=config.fuso,
        )
    )
    uvicorn.run(app, host="0.0.0.0", port=config.porta, proxy_headers=False, server_header=False)


if __name__ == "__main__":
    main()
