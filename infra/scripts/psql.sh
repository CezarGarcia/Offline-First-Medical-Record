#!/usr/bin/env bash
# Abre o psql no banco central do MedicalField (dentro do container, como "postgres").
# Não pede senha, porque a conexão é local dentro do container.
#
# Uso (de qualquer pasta do repositório):
#   ./infra/scripts/psql.sh                       # sessão interativa
#   ./infra/scripts/psql.sh -c "SELECT now();"     # um comando só
#   ./infra/scripts/psql.sh < arquivo.sql           # um arquivo de comandos
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -t 0 ]]; then
  exec docker compose exec db psql -U postgres -d medicalfield "$@"
fi
# Sem terminal (arquivo, pipe, CI): sem pseudo-TTY, senão o Docker recusa a entrada
exec docker compose exec -T db psql -U postgres -d medicalfield "$@"
