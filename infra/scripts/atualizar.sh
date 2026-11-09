#!/usr/bin/env bash
# Atualiza o sistema para a versão mais nova do repositório: baixa o código, reconstrói as imagens (uma de
# cada vez), sobe de novo e confere. Os dados ficam (o volume do banco não muda); as migrations rodam sozinhas.
#
# Uso: ./infra/scripts/atualizar.sh
source "$(dirname "$0")/_comum.sh"
exigir_docker
exigir_env

titulo "Código"
por_baixo "git pull --ff-only"
git -C "$INFRA/.." pull --ff-only || erro "não deu para atualizar o código (há mudanças locais nos arquivos? git status)."

avisar_memoria_para_build
construir_imagens

titulo "Subindo a versão nova"
por_baixo "docker compose up -d --wait --remove-orphans"
docker compose up -d --wait --remove-orphans
# As imagens antigas ficam sem nome e só ocupam disco
por_baixo "docker image prune -f"
docker image prune -f >/dev/null

mostrar_schemas_no_psql

titulo "Conferindo"
"$INFRA/scripts/verificar.sh"
