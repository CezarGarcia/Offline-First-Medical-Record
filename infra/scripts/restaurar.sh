#!/usr/bin/env bash
# Volta o banco central para um backup feito pelo ./infra/scripts/backup.sh. Apaga tudo o que existe hoje.
# O banco é recriado do zero (os logs de auditoria não podem ser apagados um a um, D-04) e recebe o backup.
#
# Uso: ./infra/scripts/restaurar.sh infra/backups/<arquivo>.dump [--sim]
source "$(dirname "$0")/_comum.sh"
exigir_docker
exigir_env

arquivo="" SIM=0
for argumento in "$@"; do
  case "$argumento" in
    --sim) SIM=1 ;;
    *) arquivo="$argumento" ;;
  esac
done
[[ -n "$arquivo" ]] || {
  echo "Uso: ./infra/scripts/restaurar.sh infra/backups/<arquivo>.dump"
  echo "Backups guardados:"
  ls -1t backups/*.dump 2>/dev/null | sed 's|^|  infra/|' || echo "  (nenhum)"
  exit 1
}
# Aceita o caminho a partir da raiz do repositório, de infra/ ou absoluto
for candidato in "$arquivo" "$OLDPWD/$arquivo" "$INFRA/../$arquivo" "$INFRA/$arquivo"; do
  [[ -f "$candidato" ]] && arquivo="$(cd "$(dirname "$candidato")" && pwd)/$(basename "$candidato")" && break
done
[[ -f "$arquivo" ]] || erro "arquivo não encontrado: $arquivo"

echo "Isto APAGA todos os dados de agora e coloca no lugar os do backup:"
echo "  $arquivo"
confirmar RESTAURAR

titulo "Recriando o banco"
compose_quieto down -v
compose_quieto up -d --wait db
ok "Banco novo, vazio."
titulo "Restaurando o backup"
docker compose exec -T db pg_restore -U postgres -d medicalfield --clean --if-exists --exit-on-error <"$arquivo"
titulo "Subindo os serviços"
compose_quieto up -d --wait
ok "Banco restaurado de $(basename "$arquivo")."
echo "Os aparelhos (app cliente) guardam os próprios dados: se o backup for de antes de um ensaio,"
echo "apague os dados deles também (apps/cliente/scripts/apagar-dados-locais.cmd)."
