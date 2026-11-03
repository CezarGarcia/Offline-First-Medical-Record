#!/usr/bin/env bash
# Mostra ou troca a estratégia de unificação de duplicados (D-10): MAIS_RECENTE_VENCE (padrão) ou
# SERVIDOR_VENCE. É a variação do roteiro do conflito (docs/11, seção 11.4). Reinicia o ms-clinico.
#
# Uso: ./infra/scripts/estrategia.sh                       (mostra a atual)
#      ./infra/scripts/estrategia.sh SERVIDOR_VENCE
#      ./infra/scripts/estrategia.sh MAIS_RECENTE_VENCE
source "$(dirname "$0")/_comum.sh"
exigir_docker
exigir_env

atual="$(ler_env ESTRATEGIA_CONFLITO)"
atual="${atual:-MAIS_RECENTE_VENCE}"
if [[ $# -eq 0 ]]; then
  echo "Estratégia atual: $atual"
  echo "Para trocar: ./infra/scripts/estrategia.sh MAIS_RECENTE_VENCE  ou  ./infra/scripts/estrategia.sh SERVIDOR_VENCE"
  exit 0
fi
nova="$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"
case "$nova" in
  MAIS_RECENTE_VENCE | SERVIDOR_VENCE) ;;
  *) erro "estratégia desconhecida: $1 (use MAIS_RECENTE_VENCE ou SERVIDOR_VENCE)" ;;
esac
if [[ "$nova" == "$atual" ]] && [[ "$(docker inspect --format '{{.State.Status}}' medicalfield-ms-clinico 2>/dev/null)" == running ]]; then
  ok "A estratégia já é $nova."
  exit 0
fi
gravar_env ESTRATEGIA_CONFLITO "$nova"
titulo "Reiniciando o ms-clinico com $nova"
compose_quieto up -d --wait ms-clinico
ok "Estratégia de conflitos: $nova. Vale para as próximas unificações (as já feitas não mudam)."
