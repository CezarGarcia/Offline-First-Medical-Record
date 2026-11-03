-- ms-clinico: dados clínicos (schema clinico). Modelo em docs/05-modelo-de-dados.md.
-- Pessoa, prontuário e atendimento não são editados pela aplicação (D-08); a única
-- alteração possível é a unificação de duplicados feita pelo próprio serviço.

-- Catálogo de medicamentos (cadastro de apoio, inserido direto no banco)
CREATE TABLE clinico.medicamento (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  nome            text        NOT NULL CHECK (length(btrim(nome)) > 0),
  apresentacao    text,
  unidade_padrao  text        NOT NULL DEFAULT 'MG'
                  CHECK (unidade_padrao IN ('MG', 'MCG', 'G', 'ML', 'UI', 'GOTA', 'COMPRIMIDO', 'AMPOLA', 'OUTRA')),
  ativo           boolean     NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX medicamento_nome_apresentacao
  ON clinico.medicamento (lower(nome), lower(coalesce(apresentacao, '')));
CREATE INDEX medicamento_atualizado_em ON clinico.medicamento (atualizado_em);

-- Mantém atualizado_em certo em qualquer UPDATE, até nos feitos à mão no SQL
-- (é o que o "receber dados" do cliente usa para saber o que mudou)
CREATE FUNCTION clinico.tocar_atualizado_em() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER medicamento_atualizado_em BEFORE UPDATE ON clinico.medicamento
  FOR EACH ROW EXECUTE FUNCTION clinico.tocar_atualizado_em();

CREATE TABLE clinico.pessoa (
  id                   uuid        PRIMARY KEY,
  nome                 text        NOT NULL CHECK (length(btrim(nome)) > 0),
  cpf                  text        CHECK (cpf ~ '^[0-9]{11}$'),
  data_nascimento      date,
  sexo                 text        CHECK (sexo IN ('MASCULINO', 'FEMININO', 'OUTRO', 'NAO_INFORMADO')),
  telefone             text,
  email                text,
  contato_nome         text,
  contato_parentesco   text,
  contato_telefone     text,
  contato_email        text,
  -- Data/hora de origem de cada campo (regra "mais recente vence" da unificação)
  carimbos             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Bloco de origem (rastreabilidade)
  criado_por_id        uuid        NOT NULL,
  criado_por_nome      text        NOT NULL,
  criado_por_registro  text        NOT NULL,
  criado_em            timestamptz NOT NULL,
  dispositivo_id       uuid,
  dispositivo_nome     text,
  modo_registro        text        NOT NULL CHECK (modo_registro IN ('ONLINE', 'OFFLINE')),
  sincronizado_por_id  uuid        NOT NULL,
  recebido_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX pessoa_cpf_unico ON clinico.pessoa (cpf) WHERE cpf IS NOT NULL;
CREATE INDEX pessoa_nome ON clinico.pessoa (nome);
CREATE INDEX pessoa_atualizado_em ON clinico.pessoa (atualizado_em);

CREATE TABLE clinico.prontuario (
  id                         uuid        PRIMARY KEY,
  pessoa_id                  uuid        NOT NULL UNIQUE REFERENCES clinico.pessoa (id),
  tipo_sanguineo             text        CHECK (tipo_sanguineo IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'DESCONHECIDO')),
  alergias                   text,
  comorbidades               text,
  medicamentos_uso_continuo  text,
  observacoes                text,
  carimbos                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_por_id              uuid        NOT NULL,
  criado_por_nome            text        NOT NULL,
  criado_por_registro        text        NOT NULL,
  criado_em                  timestamptz NOT NULL,
  dispositivo_id             uuid,
  dispositivo_nome           text,
  modo_registro              text        NOT NULL CHECK (modo_registro IN ('ONLINE', 'OFFLINE')),
  sincronizado_por_id        uuid        NOT NULL,
  recebido_em                timestamptz NOT NULL DEFAULT now(),
  atualizado_em              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prontuario_atualizado_em ON clinico.prontuario (atualizado_em);

-- A Ficha de Atendimento
CREATE TABLE clinico.atendimento (
  id                   uuid        PRIMARY KEY,
  prontuario_id        uuid        NOT NULL REFERENCES clinico.prontuario (id),
  data_hora            timestamptz NOT NULL,
  local_ocorrencia     text,
  tipo_ocorrencia      text        NOT NULL CHECK (tipo_ocorrencia IN ('CLINICA', 'TRAUMA', 'OBSTETRICA', 'PSIQUIATRICA', 'OUTRO')),
  queixa_principal     text        NOT NULL CHECK (length(btrim(queixa_principal)) > 0),
  triagem_protocolo    text        NOT NULL CHECK (triagem_protocolo IN ('MANCHESTER', 'START')),
  triagem_cor          text        NOT NULL,
  glasgow_ocular       smallint    CHECK (glasgow_ocular BETWEEN 1 AND 4),
  glasgow_verbal       smallint    CHECK (glasgow_verbal BETWEEN 1 AND 5),
  glasgow_motora       smallint    CHECK (glasgow_motora BETWEEN 1 AND 6),
  glasgow_total        smallint    GENERATED ALWAYS AS (glasgow_ocular + glasgow_verbal + glasgow_motora) STORED,
  pa_sistolica         smallint    CHECK (pa_sistolica BETWEEN 0 AND 300),
  pa_diastolica        smallint    CHECK (pa_diastolica BETWEEN 0 AND 200),
  freq_cardiaca        smallint    CHECK (freq_cardiaca BETWEEN 0 AND 300),
  freq_respiratoria    smallint    CHECK (freq_respiratoria BETWEEN 0 AND 80),
  spo2                 smallint    CHECK (spo2 BETWEEN 0 AND 100),
  temperatura          numeric(4,1) CHECK (temperatura BETWEEN 25.0 AND 45.0),
  glicemia             smallint    CHECK (glicemia BETWEEN 0 AND 1500),
  procedimentos        text,
  desfecho             text        NOT NULL CHECK (desfecho IN ('ENCAMINHADO_HOSPITAL', 'LIBERADO_NO_LOCAL', 'RECUSOU_ATENDIMENTO', 'OBITO')),
  destino              text,
  observacoes          text,
  criado_por_id        uuid        NOT NULL,
  criado_por_nome      text        NOT NULL,
  criado_por_registro  text        NOT NULL,
  criado_em            timestamptz NOT NULL,
  dispositivo_id       uuid,
  dispositivo_nome     text,
  modo_registro        text        NOT NULL CHECK (modo_registro IN ('ONLINE', 'OFFLINE')),
  sincronizado_por_id  uuid        NOT NULL,
  recebido_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT atendimento_triagem_valida CHECK (
       (triagem_protocolo = 'MANCHESTER' AND triagem_cor IN ('VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL'))
    OR (triagem_protocolo = 'START'      AND triagem_cor IN ('VERMELHO', 'AMARELO', 'VERDE', 'PRETO'))),
  CONSTRAINT atendimento_glasgow_completo CHECK (
        (glasgow_ocular IS NULL) = (glasgow_verbal IS NULL)
    AND (glasgow_verbal IS NULL) = (glasgow_motora IS NULL)),
  CONSTRAINT atendimento_destino_quando_encaminhado CHECK (
    desfecho <> 'ENCAMINHADO_HOSPITAL' OR length(btrim(coalesce(destino, ''))) > 0)
);

CREATE INDEX atendimento_prontuario ON clinico.atendimento (prontuario_id);
CREATE INDEX atendimento_data_hora ON clinico.atendimento (data_hora DESC);
CREATE INDEX atendimento_atualizado_em ON clinico.atendimento (atualizado_em);

-- Medicamentos administrados num atendimento (gravados junto com ele)
CREATE TABLE clinico.atendimento_medicamento (
  id              uuid          PRIMARY KEY,
  atendimento_id  uuid          NOT NULL REFERENCES clinico.atendimento (id),
  medicamento_id  uuid          NOT NULL REFERENCES clinico.medicamento (id),
  dose            numeric(10,3) NOT NULL CHECK (dose > 0),
  unidade         text          NOT NULL CHECK (unidade IN ('MG', 'MCG', 'G', 'ML', 'UI', 'GOTA', 'COMPRIMIDO', 'AMPOLA', 'OUTRA')),
  via             text          NOT NULL CHECK (via IN ('INTRAVENOSA', 'INTRAMUSCULAR', 'SUBCUTANEA', 'ORAL', 'SUBLINGUAL', 'INALATORIA', 'INTRAOSSEA', 'TOPICA', 'OUTRA')),
  horario         timestamptz   NOT NULL,
  observacao      text
);

CREATE INDEX atendimento_medicamento_atendimento ON clinico.atendimento_medicamento (atendimento_id);
