-- ms-auth: profissionais e sessões (schema auth).
-- Modelo documentado em docs/05-modelo-de-dados.md.

CREATE TABLE auth.profissional (
  id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
  nome               text        NOT NULL CHECK (length(btrim(nome)) > 0),
  tipo_registro      text        NOT NULL CHECK (tipo_registro IN ('CRM', 'COREN', 'SOCORRISTA')),
  registro           text        NOT NULL CHECK (length(btrim(registro)) > 0),
  perfil             text        NOT NULL DEFAULT 'OPERACIONAL' CHECK (perfil IN ('ADMIN', 'OPERACIONAL')),
  senha_hash         text        NOT NULL,
  ativo              boolean     NOT NULL DEFAULT true,
  tentativas_falhas  integer     NOT NULL DEFAULT 0,
  bloqueado_ate      timestamptz,
  criado_em          timestamptz NOT NULL DEFAULT now()
);

-- O mesmo registro não se repete; maiúsculas, minúsculas e espaços nas pontas não importam
CREATE UNIQUE INDEX profissional_registro_unico
  ON auth.profissional (tipo_registro, upper(btrim(registro)));

CREATE TABLE auth.sessao (
  id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
  profissional_id     uuid        NOT NULL REFERENCES auth.profissional (id),
  refresh_token_hash  text        NOT NULL UNIQUE,
  dispositivo_id      uuid,
  dispositivo_nome    text,
  criada_em           timestamptz NOT NULL DEFAULT now(),
  expira_em           timestamptz NOT NULL,
  ultimo_uso_em       timestamptz,
  revogada_em         timestamptz
);

CREATE INDEX sessao_profissional ON auth.sessao (profissional_id);
