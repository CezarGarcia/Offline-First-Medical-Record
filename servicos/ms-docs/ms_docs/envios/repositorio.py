"""Repository dos pedidos de e-mail (tabela documentos.envio_email). SQL explícito com o SQLAlchemy Core."""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import (
    Column,
    Connection,
    DateTime,
    Integer,
    MetaData,
    Table,
    Text,
    Uuid,
    func,
    select,
    text,
)
from sqlalchemy.dialects.postgresql import insert

_metadados = MetaData(schema="documentos")

envio_email = Table(
    "envio_email",
    _metadados,
    Column("id", Uuid, primary_key=True),
    Column("atendimento_id", Uuid, nullable=False),
    Column("destinatario_tipo", Text, nullable=False),
    Column("destinatario_email", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("erro", Text),
    Column("tentativas", Integer, nullable=False),
    Column("solicitado_por_id", Uuid, nullable=False),
    Column("dispositivo_id", Uuid),
    Column("solicitado_em", DateTime(timezone=True), nullable=False),
    Column("ultima_tentativa_em", DateTime(timezone=True), nullable=False),
    Column("enviado_em", DateTime(timezone=True)),
)


@dataclass(frozen=True)
class Envio:
    id: uuid.UUID
    atendimento_id: uuid.UUID
    destinatario_tipo: str
    destinatario_email: str
    status: str
    erro: str | None
    tentativas: int
    solicitado_por_id: uuid.UUID
    dispositivo_id: uuid.UUID | None
    solicitado_em: datetime
    ultima_tentativa_em: datetime
    enviado_em: datetime | None


@dataclass(frozen=True)
class Tentativa:
    """O resultado de uma tentativa de envio, para gravar."""

    id: uuid.UUID
    atendimento_id: uuid.UUID
    destinatario_tipo: str
    destinatario_email: str
    erro: str | None  # None = enviado
    solicitado_por_id: uuid.UUID
    dispositivo_id: uuid.UUID | None


def _envio(linha) -> Envio:
    return Envio(**linha._mapping)


class RepositorioEnvios:
    def travar(self, conexao: Connection, envio_id: uuid.UUID) -> None:
        """Trava o ID do pedido até o fim da transação: dois pedidos iguais ao mesmo tempo não mandam dois e-mails."""
        conexao.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:chave, 0))"), {"chave": f"envio_email:{envio_id}"}
        )

    def buscar(self, conexao: Connection, envio_id: uuid.UUID) -> Envio | None:
        linha = conexao.execute(select(envio_email).where(envio_email.c.id == envio_id)).first()
        return _envio(linha) if linha else None

    def gravar_tentativa(self, conexao: Connection, tentativa: Tentativa) -> Envio:
        """Primeira tentativa: cria o pedido. Nas seguintes, só atualiza o resultado (o resto do pedido não muda)."""
        enviado = tentativa.erro is None
        # clock_timestamp(): a hora real da tentativa (now() seria a do início da transação, antes do envio)
        agora = func.clock_timestamp()
        comando = insert(envio_email).values(
            id=tentativa.id,
            atendimento_id=tentativa.atendimento_id,
            destinatario_tipo=tentativa.destinatario_tipo,
            destinatario_email=tentativa.destinatario_email,
            status="ENVIADO" if enviado else "ERRO",
            erro=tentativa.erro,
            tentativas=1,
            solicitado_por_id=tentativa.solicitado_por_id,
            dispositivo_id=tentativa.dispositivo_id,
            solicitado_em=agora,
            ultima_tentativa_em=agora,
            enviado_em=agora if enviado else None,
        )
        comando = comando.on_conflict_do_update(
            index_elements=[envio_email.c.id],
            set_={
                "status": comando.excluded.status,
                "erro": comando.excluded.erro,
                "tentativas": envio_email.c.tentativas + 1,
                "ultima_tentativa_em": comando.excluded.ultima_tentativa_em,
                "enviado_em": comando.excluded.enviado_em,
            },
        ).returning(*envio_email.c)
        return _envio(conexao.execute(comando).one())

    def listar(
        self, conexao: Connection, atendimento_id: uuid.UUID | None, pagina: int, tamanho: int
    ) -> tuple[list[Envio], int]:
        filtro = [envio_email.c.atendimento_id == atendimento_id] if atendimento_id else []
        total = conexao.execute(select(func.count()).select_from(envio_email).where(*filtro)).scalar_one()
        linhas = conexao.execute(
            select(envio_email)
            .where(*filtro)
            .order_by(envio_email.c.solicitado_em.desc(), envio_email.c.id.desc())
            .limit(tamanho)
            .offset((pagina - 1) * tamanho)
        ).all()
        return [_envio(linha) for linha in linhas], total
