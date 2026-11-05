/**
 * Tabelas do banco local (docs/05-modelo-de-dados.md, seção 5.3). As de dados têm as mesmas colunas do banco
 * central, mais o estado da sincronização. Não há chaves estrangeiras: quem garante a integridade é o servidor
 * (o que vem dele substitui a cópia local), e um registro recebido nunca pode ser recusado pelo banco local.
 */
export interface Migracao {
  versao: number;
  sql: string;
}

const ORIGEM = `
  criado_por_id        TEXT NOT NULL,
  criado_por_nome      TEXT NOT NULL,
  criado_por_registro  TEXT NOT NULL,
  criado_em            TEXT NOT NULL,
  dispositivo_id       TEXT,
  dispositivo_nome     TEXT,
  modo_registro        TEXT NOT NULL,
  sincronizado_por_id  TEXT,
  recebido_em          TEXT,
  atualizado_em        TEXT,
  estado_sync          TEXT NOT NULL DEFAULT 'PENDENTE'`;

export const MIGRACOES: Migracao[] = [
  {
    versao: 1,
    sql: `
      CREATE TABLE config (
        chave  TEXT PRIMARY KEY,
        valor  TEXT
      );

      CREATE TABLE medicamento (
        id              TEXT PRIMARY KEY,
        nome            TEXT NOT NULL,
        apresentacao    TEXT,
        unidade_padrao  TEXT NOT NULL,
        ativo           INTEGER NOT NULL DEFAULT 1,
        atualizado_em   TEXT NOT NULL
      );

      CREATE TABLE pessoa (
        id                  TEXT PRIMARY KEY,
        nome                TEXT NOT NULL,
        cpf                 TEXT,
        data_nascimento     TEXT,
        sexo                TEXT,
        telefone            TEXT,
        email               TEXT,
        contato_nome        TEXT,
        contato_parentesco  TEXT,
        contato_telefone    TEXT,
        contato_email       TEXT,
        ${ORIGEM}
      );
      CREATE INDEX pessoa_cpf ON pessoa (cpf);

      CREATE TABLE prontuario (
        id                         TEXT PRIMARY KEY,
        pessoa_id                  TEXT NOT NULL,
        tipo_sanguineo             TEXT,
        alergias                   TEXT,
        comorbidades               TEXT,
        medicamentos_uso_continuo  TEXT,
        observacoes                TEXT,
        ${ORIGEM}
      );
      CREATE INDEX prontuario_pessoa ON prontuario (pessoa_id);

      CREATE TABLE atendimento (
        id                 TEXT PRIMARY KEY,
        prontuario_id      TEXT NOT NULL,
        data_hora          TEXT NOT NULL,
        local_ocorrencia   TEXT,
        tipo_ocorrencia    TEXT NOT NULL,
        queixa_principal   TEXT NOT NULL,
        triagem_protocolo  TEXT NOT NULL,
        triagem_cor        TEXT NOT NULL,
        glasgow_ocular     INTEGER,
        glasgow_verbal     INTEGER,
        glasgow_motora     INTEGER,
        pa_sistolica       INTEGER,
        pa_diastolica      INTEGER,
        freq_cardiaca      INTEGER,
        freq_respiratoria  INTEGER,
        spo2               INTEGER,
        temperatura        REAL,
        glicemia           INTEGER,
        procedimentos      TEXT,
        desfecho           TEXT NOT NULL,
        destino            TEXT,
        observacoes        TEXT,
        ${ORIGEM}
      );
      CREATE INDEX atendimento_prontuario ON atendimento (prontuario_id);
      CREATE INDEX atendimento_data ON atendimento (data_hora DESC);

      CREATE TABLE atendimento_medicamento (
        id              TEXT PRIMARY KEY,
        atendimento_id  TEXT NOT NULL,
        medicamento_id  TEXT NOT NULL,
        nome            TEXT,
        dose            REAL NOT NULL,
        unidade         TEXT NOT NULL,
        via             TEXT NOT NULL,
        horario         TEXT NOT NULL,
        observacao      TEXT
      );
      CREATE INDEX atendimento_medicamento_atendimento ON atendimento_medicamento (atendimento_id);

      -- Fila de pendentes (padrão Outbox): cada item é um comando que o motor de sincronização executa
      CREATE TABLE outbox (
        ordem                 INTEGER PRIMARY KEY AUTOINCREMENT,
        id                    TEXT NOT NULL UNIQUE,
        tipo                  TEXT NOT NULL,
        entidade_id           TEXT NOT NULL,
        payload               TEXT NOT NULL,
        status                TEXT NOT NULL DEFAULT 'PENDENTE',
        tentativas            INTEGER NOT NULL DEFAULT 0,
        ultimo_erro           TEXT,
        proxima_tentativa_em  TEXT,
        resultado             TEXT,
        criado_por_id         TEXT NOT NULL,
        criado_em             TEXT NOT NULL,
        concluido_em          TEXT
      );
      CREATE INDEX outbox_status ON outbox (status, ordem);

      CREATE TABLE log_local (
        id               TEXT PRIMARY KEY,
        profissional_id  TEXT,
        data_hora        TEXT NOT NULL,
        acao             TEXT NOT NULL,
        modo             TEXT NOT NULL,
        detalhes         TEXT,
        enviado_em       TEXT
      );
      CREATE INDEX log_local_nao_enviado ON log_local (enviado_em, data_hora);

      -- Quem já entrou online neste aparelho: permite o login offline (docs/08, seção 8.5)
      CREATE TABLE credencial_offline (
        profissional_id     TEXT PRIMARY KEY,
        tipo_registro       TEXT NOT NULL,
        registro            TEXT NOT NULL,
        nome                TEXT NOT NULL,
        perfil              TEXT NOT NULL,
        verificador         TEXT NOT NULL,
        sal                 TEXT NOT NULL,
        validado_online_em  TEXT NOT NULL,
        tentativas_falhas   INTEGER NOT NULL DEFAULT 0,
        bloqueado_ate       TEXT,
        UNIQUE (tipo_registro, registro)
      );

      -- No máximo uma linha: quem está logado agora
      CREATE TABLE sessao (
        id                         INTEGER PRIMARY KEY CHECK (id = 1),
        profissional_id            TEXT NOT NULL,
        modo_login                 TEXT NOT NULL,
        iniciada_em                TEXT NOT NULL,
        expira_em                  TEXT NOT NULL,
        refresh_token_cifrado      BLOB,
        sessao_servidor_expira_em  TEXT
      );
    `,
  },
  {
    versao: 2,
    sql: `
      -- Réplica das credenciais do servidor (D-51): os profissionais ativos, com o hash bcrypt da senha cifrado
      -- pelo cofre do sistema. Permite o login offline de quem nunca entrou online neste aparelho.
      CREATE TABLE credencial_servidor (
        profissional_id     TEXT PRIMARY KEY,
        tipo_registro       TEXT NOT NULL,
        registro            TEXT NOT NULL,
        nome                TEXT NOT NULL,
        perfil              TEXT NOT NULL,
        senha_hash_cifrado  BLOB NOT NULL,
        recebido_em         TEXT NOT NULL,
        tentativas_falhas   INTEGER NOT NULL DEFAULT 0,
        bloqueado_ate       TEXT,
        UNIQUE (tipo_registro, registro)
      );
    `,
  },
];
