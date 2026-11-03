#!/usr/bin/env bash
# Abre o psql no banco central do MedicalField (dentro do container, como "postgres").
# Não pede senha, porque a conexão é local dentro do container.
#
# Uso (de qualquer pasta do repositório):
#   ./infra/scripts/psql.sh                       # sessão interativa
#   ./infra/scripts/psql.sh -c "SELECT now();"     # um comando só
set -euo pipefail
cd "$(dirname "$0")/.."
exec docker compose exec db psql -U postgres -d medicalfield "$@"
