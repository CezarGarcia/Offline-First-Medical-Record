-- Auditoria (schema auditoria, dono: ms-auth).
-- ms-clinico e ms-docs recebem só INSERT nestas tabelas, pelo ALTER DEFAULT PRIVILEGES
-- do script de inicialização do banco (infra/postgres/init/01-estrutura.sh).
-- Atenção: quem só tem INSERT não pode usar RETURNING.

-- Uma linha por requisição HTTP recebida por qualquer serviço
CREATE TABLE auditoria.log_acesso (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  data_hora        timestamptz NOT NULL DEFAULT now(),
  servico          text        NOT NULL,
  ip_cliente       text        NOT NULL,
  profissional_id  uuid,
  metodo           text        NOT NULL,
  rota             text        NOT NULL,
  status_code      smallint    NOT NULL,
  tempo_ms         integer     NOT NULL,
  dispositivo_id   uuid,
  user_agent       text
);

CREATE INDEX log_acesso_data_hora    ON auditoria.log_acesso (data_hora DESC);
CREATE INDEX log_acesso_profissional ON auditoria.log_acesso (profissional_id);

-- Ações feitas no app cliente (principalmente offline), recebidas por POST /api/log
CREATE TABLE auditoria.log_cliente (
  id                uuid        PRIMARY KEY,
  profissional_id   uuid,
  dispositivo_id    uuid        NOT NULL,
  dispositivo_nome  text,
  data_hora         timestamptz NOT NULL,
  acao              text        NOT NULL,
  modo              text        NOT NULL CHECK (modo IN ('ONLINE', 'OFFLINE')),
  detalhes          jsonb,
  enviado_por_id    uuid        NOT NULL,
  recebido_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX log_cliente_data_hora ON auditoria.log_cliente (data_hora DESC);

-- Log não se altera nem se apaga (vale até para o dono das tabelas e para o superusuário).
-- Gatilhos de comando (FOR EACH STATEMENT): recusam qualquer UPDATE, DELETE ou TRUNCATE,
-- mesmo que o comando não atinja nenhuma linha.
CREATE FUNCTION auditoria.impedir_alteracao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registros de auditoria não podem ser alterados nem apagados (tabela %).', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER log_acesso_imutavel
  BEFORE UPDATE OR DELETE OR TRUNCATE ON auditoria.log_acesso
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria.impedir_alteracao();

CREATE TRIGGER log_cliente_imutavel
  BEFORE UPDATE OR DELETE OR TRUNCATE ON auditoria.log_cliente
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria.impedir_alteracao();
