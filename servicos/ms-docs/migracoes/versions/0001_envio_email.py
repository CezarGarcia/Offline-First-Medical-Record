"""Pedidos de envio da ficha por e-mail.

Revision ID: 0001
Revises:
Create Date: 2026-11-03
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE documentos.envio_email (
          -- Gerado por quem pede: é a chave de idempotência (o mesmo ID nunca manda dois e-mails)
          id                   uuid        PRIMARY KEY,
          -- Sem FK: o atendimento fica em outro schema, de outro serviço
          atendimento_id       uuid        NOT NULL,
          destinatario_tipo    text        NOT NULL CHECK (destinatario_tipo IN ('PACIENTE', 'FAMILIAR', 'OUTRO')),
          destinatario_email   text        NOT NULL CHECK (length(btrim(destinatario_email)) > 0),
          status               text        NOT NULL CHECK (status IN ('ENVIADO', 'ERRO')),
          erro                 text,
          tentativas           integer     NOT NULL DEFAULT 1 CHECK (tentativas > 0),
          solicitado_por_id    uuid        NOT NULL,
          dispositivo_id       uuid,
          solicitado_em        timestamptz NOT NULL DEFAULT now(),
          ultima_tentativa_em  timestamptz NOT NULL DEFAULT now(),
          enviado_em           timestamptz,
          CONSTRAINT envio_email_data_do_envio CHECK ((status = 'ENVIADO') = (enviado_em IS NOT NULL)),
          CONSTRAINT envio_email_erro_explicado CHECK (status = 'ENVIADO' OR erro IS NOT NULL)
        )
        """
    )
    op.execute("CREATE INDEX envio_email_por_data ON documentos.envio_email (solicitado_em DESC, id DESC)")
    op.execute(
        "CREATE INDEX envio_email_por_atendimento ON documentos.envio_email (atendimento_id, solicitado_em DESC)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE documentos.envio_email")
