#!/usr/bin/env bash
# Guarda uma cópia do banco central inteiro (todos os schemas, inclusive a auditoria) em infra/backups/.
# Bom depois de um ensaio que deu certo: o ./infra/scripts/restaurar.sh volta exatamente para esse estado.
#
# Uso: ./infra/scripts/backup.sh [nome]      (ex.: ./infra/scripts/backup.sh pronto-para-apresentar)
source "$(dirname "$0")/_comum.sh"
exigir_docker
exigir_env
banco_no_ar || erro "o banco não está no ar (docker compose up -d db)."

nome="$(printf '%s' "${1:-manual}" | tr -c 'A-Za-z0-9_-' '-')"
mkdir -p backups
arquivo="backups/$(date +%Y-%m-%d_%H%M%S)-${nome}.dump"
docker compose exec -T db pg_dump -U postgres -d medicalfield --format=custom >"$arquivo" </dev/null
ok "Backup salvo em infra/$arquivo ($(du -h "$arquivo" | cut -f1))"
