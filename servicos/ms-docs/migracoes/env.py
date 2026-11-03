"""Ambiente do Alembic.

O ms-docs aplica as migrations sozinho ao subir (ms_docs/banco.py), passando a conexão já aberta.
Pela linha de comando (ex.: `alembic upgrade head` ou `alembic revision -m "..."`), a conexão é montada
com as mesmas variáveis de ambiente do serviço (DB_HOST, DB_PORTA, DB_SENHA...).
"""

from alembic import context

conexao = context.config.attributes.get("connection")


def executar(conexao) -> None:
    context.configure(
        connection=conexao,
        # A tabela de controle do Alembic fica no schema do próprio serviço
        version_table_schema="documentos",
        transaction_per_migration=False,
    )
    with context.begin_transaction():
        context.run_migrations()


if conexao is not None:
    executar(conexao)
else:
    from ms_docs.banco import criar_engine
    from ms_docs.config import config_banco

    engine = criar_engine(config_banco())
    with engine.begin() as nova_conexao:
        executar(nova_conexao)
    engine.dispose()
