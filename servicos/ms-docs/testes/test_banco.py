"""Migrations do schema documentos (Alembic)."""

from sqlalchemy import text

from ms_docs.banco import aplicar_migracoes


def test_migracoes_podem_rodar_de_novo(engine):
    # Rodar de novo (como em todo reinício do container) não muda nada nem dá erro
    aplicar_migracoes(engine)
    with engine.connect() as conexao:
        versao = conexao.execute(text("SELECT version_num FROM documentos.alembic_version")).scalar_one()
        dono = conexao.execute(
            text("SELECT tableowner FROM pg_tables WHERE schemaname = 'documentos' AND tablename = 'envio_email'")
        ).scalar_one()
    assert versao == "0001"
    assert dono == "ms_docs"
