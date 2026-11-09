#!/usr/bin/env bash
# Inicialização do banco central do MedicalField.
#
# Roda UMA única vez, quando o volume do banco é criado (primeira subida do container).
# Cria: os usuários de cada serviço, um schema por serviço + o schema de auditoria,
# as permissões e a extensão pgcrypto.
#
# As TABELAS não são criadas aqui: cada serviço cria as suas com as próprias migrations
# (ver docs/05-modelo-de-dados.md).
set -euo pipefail

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v ms_auth_senha="$MS_AUTH_DB_PASSWORD" \
  -v ms_clinico_senha="$MS_CLINICO_DB_PASSWORD" \
  -v ms_docs_senha="$MS_DOCS_DB_PASSWORD" <<'SQL'
-- Um usuário por microsserviço
CREATE ROLE ms_auth    LOGIN PASSWORD :'ms_auth_senha';
CREATE ROLE ms_clinico LOGIN PASSWORD :'ms_clinico_senha';
CREATE ROLE ms_docs    LOGIN PASSWORD :'ms_docs_senha';

-- Só os usuários do sistema (e o postgres) conectam neste banco
REVOKE CONNECT ON DATABASE medicalfield FROM PUBLIC;
GRANT  CONNECT ON DATABASE medicalfield TO ms_auth, ms_clinico, ms_docs;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Um schema por serviço: cada serviço é dono apenas do seu
CREATE SCHEMA auth       AUTHORIZATION ms_auth;
CREATE SCHEMA clinico    AUTHORIZATION ms_clinico;
CREATE SCHEMA documentos AUTHORIZATION ms_docs;

-- Auditoria: o dono é o ms-auth (cria as tabelas e lista os logs para o portal).
-- ms-clinico e ms-docs só podem INSERIR: não leem, não alteram e não apagam.
CREATE SCHEMA auditoria AUTHORIZATION ms_auth;
GRANT USAGE ON SCHEMA auditoria TO ms_clinico, ms_docs;
ALTER DEFAULT PRIVILEGES FOR ROLE ms_auth IN SCHEMA auditoria
  GRANT INSERT ON TABLES TO ms_clinico, ms_docs;

-- Caminho de busca padrão de cada usuário
ALTER ROLE ms_auth    SET search_path = auth, auditoria, public;
ALTER ROLE ms_clinico SET search_path = clinico, public;
ALTER ROLE ms_docs    SET search_path = documentos, public;

-- crypt() e gen_salt(): permitem cadastrar um profissional direto no SQL,
-- já com a senha em bcrypt (o mesmo formato que o ms-auth confere no login)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- No psql, o postgres enxerga as tabelas dos quatro schemas sem o prefixo: \dt lista tudo e
-- "SELECT * FROM pessoa" funciona (os serviços continuam com o caminho de busca de cada um)
ALTER ROLE postgres IN DATABASE medicalfield SET search_path = clinico, auth, documentos, auditoria, public;
SQL

echo "MedicalField: usuários, schemas e permissões criados."
