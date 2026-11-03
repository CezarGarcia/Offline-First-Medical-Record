#!/usr/bin/env bash
# Carrega os dados de demonstração do roteiro de testes (docs/11-roteiro-de-testes.md).
# Pode rodar mais de uma vez: o que já existe não é duplicado.
#
# Uso (de qualquer pasta do repositório, com o sistema no ar):
#   ./infra/scripts/popular-demo.sh
#
# A senha das contas de demonstração vem de DEMO_SENHA, no infra/.env.
set -euo pipefail
cd "$(dirname "$0")/.."

DEMO_SENHA="$(grep -E '^DEMO_SENHA=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
# Aceita o valor com ou sem aspas no .env
DEMO_SENHA="${DEMO_SENHA%\"}"; DEMO_SENHA="${DEMO_SENHA#\"}"
DEMO_SENHA="${DEMO_SENHA%\'}"; DEMO_SENHA="${DEMO_SENHA#\'}"

if [[ -z "$DEMO_SENHA" || "$DEMO_SENHA" == "troque-esta-senha-de-demo" ]]; then
  echo "Defina DEMO_SENHA no infra/.env (uma senha só sua) antes de carregar os dados de demonstração." >&2
  exit 1
fi

psql_demo() {
  docker compose exec -T db psql -U postgres -d medicalfield -v ON_ERROR_STOP=1 "$@"
}

echo "== Profissionais"
psql_demo -v senha="$DEMO_SENHA" -f - < seed/01-profissionais.sql

if [[ "$(psql_demo -At -c "SELECT to_regclass('clinico.pessoa') IS NOT NULL")" == "t" ]]; then
  echo "== Medicamentos, pacientes, prontuários e atendimentos"
  psql_demo -f - < seed/02-clinico.sql
else
  echo "O ms-clinico ainda não criou as tabelas dele: dados clínicos não carregados (suba o ms-clinico e rode de novo)."
fi

echo "Dados de demonstração carregados."
