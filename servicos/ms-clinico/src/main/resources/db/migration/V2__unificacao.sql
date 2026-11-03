-- Unificação de duplicados (docs/07-sincronizacao.md, seção 7.6).

-- Registro de cada unificação: o que ficou, o que foi absorvido e cada diferença
CREATE TABLE clinico.conflito (
  id                   uuid        PRIMARY KEY DEFAULT uuidv7(),
  entidade             text        NOT NULL CHECK (entidade IN ('PESSOA', 'PRONTUARIO')),
  motivo               text        NOT NULL CHECK (motivo IN ('CPF_DUPLICADO', 'PRONTUARIO_DUPLICADO')),
  id_mantido           uuid        NOT NULL,
  id_descartado        uuid        NOT NULL,
  estrategia           text        NOT NULL CHECK (estrategia IN ('MAIS_RECENTE_VENCE', 'SERVIDOR_VENCE')),
  diferencas           jsonb       NOT NULL,
  dados_recebidos      jsonb       NOT NULL,
  detectado_em         timestamptz NOT NULL DEFAULT now(),
  sincronizado_por_id  uuid        NOT NULL,
  dispositivo_id       uuid,
  dispositivo_nome     text
);

CREATE INDEX conflito_detectado_em ON clinico.conflito (detectado_em DESC);

-- "Apelidos": o ID descartado passa a apontar para o mantido. Referências que chegarem
-- depois com o ID descartado são traduzidas automaticamente.
CREATE TABLE clinico.unificacao (
  id_descartado  uuid        PRIMARY KEY,
  id_mantido     uuid        NOT NULL,
  entidade       text        NOT NULL CHECK (entidade IN ('PESSOA', 'PRONTUARIO')),
  conflito_id    uuid        NOT NULL REFERENCES clinico.conflito (id),
  criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX unificacao_criado_em ON clinico.unificacao (criado_em);
