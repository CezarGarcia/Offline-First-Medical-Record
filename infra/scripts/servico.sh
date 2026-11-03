#!/usr/bin/env bash
# Para, inicia ou reinicia um serviço, ou mostra os logs. Na apresentação, serve para mostrar o que
# acontece quando uma parte cai: o resto continua, e o app cliente guarda tudo na fila até voltar.
#
# Uso: ./infra/scripts/servico.sh estado
#      ./infra/scripts/servico.sh parar <serviço>
#      ./infra/scripts/servico.sh iniciar <serviço>
#      ./infra/scripts/servico.sh reiniciar <serviço>
#      ./infra/scripts/servico.sh logs [serviço]          (Ctrl+C para sair)
# Serviços: nginx, ms-auth, ms-clinico, ms-docs, db
source "$(dirname "$0")/_comum.sh"
exigir_docker
exigir_env

acao="${1:-estado}"
servico="${2:-}"
# A lista vai para uma variável antes do grep: com o pipefail, um "grep -q" no fim do pipe pode falhar à toa
servicos="$(docker compose config --services)"
if [[ -n "$servico" ]] && ! grep -qx -- "$servico" <<<"$servicos"; then
  erro "serviço desconhecido: $servico (use: $(tr '\n' ' ' <<<"$servicos"))"
fi
exigir_servico() {
  [[ -n "$servico" ]] || erro "diga qual serviço: ./infra/scripts/servico.sh $acao <serviço>"
}

case "$acao" in
  estado) docker compose ps ;;
  parar)
    exigir_servico
    compose_quieto stop "$servico"
    ok "$servico parado."
    case "$servico" in
      nginx) aviso "Portal e API fora do ar. O app cliente com a chave em Online mostra \"Servidor inacessível\" e guarda tudo na fila." ;;
      ms-auth) aviso "Login fora do ar (503). Quem já tem token continua; o app cliente entra offline." ;;
      ms-clinico) aviso "Cadastros e sincronização fora do ar (503). O app cliente guarda o que for salvo e tenta de novo sozinho." ;;
      ms-docs) aviso "PDF e e-mail fora do ar (503). O resto funciona; o pedido de e-mail do app cliente espera na fila." ;;
      db) aviso "Banco fora do ar: os três serviços param de responder." ;;
    esac
    echo "Para voltar: ./infra/scripts/servico.sh iniciar $servico"
    ;;
  iniciar)
    exigir_servico
    compose_quieto up -d --wait "$servico"
    ok "$servico no ar de novo."
    ;;
  reiniciar)
    exigir_servico
    compose_quieto restart "$servico"
    compose_quieto up -d --wait "$servico"
    ok "$servico reiniciado."
    ;;
  logs) docker compose logs -f --tail 100 ${servico:+"$servico"} ;;
  *) erro "ação desconhecida: $acao (use estado, parar, iniciar, reiniciar ou logs)" ;;
esac
