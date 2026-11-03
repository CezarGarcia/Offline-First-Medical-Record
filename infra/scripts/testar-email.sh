#!/usr/bin/env bash
# Manda de verdade a ficha de um atendimento de demonstração para um endereço, pelo mesmo caminho do portal
# (login do admin, POST /api/documentos/ficha/{id}/email). Confere a configuração do Gmail antes da
# apresentação: se der errado, mostra a mensagem do ms-docs (senha de app, porta bloqueada...).
#
# Uso: ./infra/scripts/testar-email.sh <seu e-mail>
source "$(dirname "$0")/_comum.sh"
exigir_docker
exigir_env

destino="${1:-}"
[[ "$destino" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || erro "informe um e-mail: ./infra/scripts/testar-email.sh voce@exemplo.com"
[[ -n "$(ler_env SMTP_HOST)" ]] || erro "o envio está desligado: SMTP_HOST vazio no infra/.env (docs/12, seção 12.8)."
senha="$(ler_env DEMO_SENHA)"
[[ -n "$senha" ]] || erro "defina DEMO_SENHA no infra/.env."
URL="$(url_base)"

login="$(curl -s --max-time 15 -X POST -H 'Content-Type: application/json' \
  -d "{\"tipoRegistro\":\"CRM\",\"registro\":\"10001-RS\",\"senha\":$(json_texto "$senha"),\"dispositivo\":{\"nome\":\"testar-email.sh\"}}" \
  "$URL/api/auth/login" || true)"
token="$(printf '%s' "$login" | sed -n 's/.*"tokenDeAcesso":"\([^"]*\)".*/\1/p')"
[[ -n "$token" ]] || erro "o login do admin falhou: ${login:-sem resposta} (rode ./infra/scripts/verificar.sh)"

atendimento="$(consultar "SELECT id FROM clinico.atendimento ORDER BY data_hora DESC LIMIT 1")"
[[ -n "$atendimento" ]] || erro "não há nenhum atendimento no banco (./infra/scripts/popular-demo.sh)."
pedido="$(cat /proc/sys/kernel/random/uuid)"

numero="$(printf '%s' "${atendimento//-/}" | tail -c 8 | tr '[:lower:]' '[:upper:]')"
echo "Mandando a ficha Nº $numero para $destino pelo $(ler_env SMTP_HOST)..."
resposta="$(curl -s --max-time 120 -w '\n%{http_code}' -X POST -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
  -d "{\"id\":\"$pedido\",\"destinatario\":{\"tipo\":\"OUTRO\",\"email\":$(json_texto "$destino")}}" \
  "$URL/api/documentos/ficha/$atendimento/email" || true)"
codigo="${resposta##*$'\n'}"
corpo="${resposta%$'\n'*}"
curl -s -o /dev/null --max-time 10 -X POST -H "Authorization: Bearer $token" "$URL/api/auth/logout" || true

if [[ "$codigo" == 201 ]]; then
  ok "E-mail enviado. Confira a caixa de entrada de $destino (e o spam): a ficha vai em PDF, anexada."
else
  mensagem="$(printf '%s' "$corpo" | sed -n 's/.*"mensagem":"\([^"]*\)".*/\1/p')"
  falha "O envio respondeu $codigo: ${mensagem:-$corpo}"
  echo "Ver as mensagens de erro do Gmail em docs/12, seção 12.8."
  exit 1
fi
