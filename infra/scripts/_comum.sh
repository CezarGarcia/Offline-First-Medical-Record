#!/usr/bin/env bash
# Funções usadas pelos outros scripts desta pasta (não precisa rodar este arquivo).
# Todos os scripts trabalham dentro de infra/, com o docker-compose.yml e o .env de lá.
set -euo pipefail

INFRA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$INFRA"

# Os serviços que o projeto constrói (os outros vêm prontos do Docker Hub)
SERVICOS_COM_BUILD=(ms-auth ms-clinico ms-docs nginx)

if [[ -t 1 ]]; then
  _verde=$'\033[32m' _vermelho=$'\033[31m' _amarelo=$'\033[33m' _negrito=$'\033[1m' _cinza=$'\033[2m' _fim=$'\033[0m'
else
  _verde='' _vermelho='' _amarelo='' _negrito='' _cinza='' _fim=''
fi
ok() { printf '  %s✓%s %s\n' "$_verde" "$_fim" "$*"; }
falha() { printf '  %s✗%s %s\n' "$_vermelho" "$_fim" "$*"; }
aviso() { printf '  %s!%s %s\n' "$_amarelo" "$_fim" "$*"; }
titulo() { printf '\n%s%s%s\n' "$_negrito" "$*" "$_fim"; }
# O comando que o script roda por baixo: para fazer à mão, é só rodá-lo na pasta infra/ (docs/12, seção 12.15)
por_baixo() { printf '  %s$ %s%s\n' "$_cinza" "$*" "$_fim"; }
erro() {
  printf '%sErro:%s %s\n' "$_vermelho" "$_fim" "$*" >&2
  exit 1
}

# Valor de uma variável do infra/.env (sem as aspas)
ler_env() {
  local valor
  valor="$(grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  valor="${valor%\"}"
  valor="${valor#\"}"
  valor="${valor%\'}"
  valor="${valor#\'}"
  printf '%s' "$valor"
}

# Troca (ou acrescenta) uma variável no infra/.env
gravar_env() {
  if grep -qE "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    printf '%s=%s\n' "$1" "$2" >>.env
  fi
}

exigir_env() {
  [[ -f .env ]] || erro "falta o infra/.env. Rode ./infra/scripts/instalar.sh (ou, na pasta infra: cp .env.example .env, e defina a DEMO_SENHA)."
}

exigir_docker() {
  command -v docker >/dev/null || erro "o Docker não está instalado (docs/12, seção 12.2)."
  docker compose version >/dev/null 2>&1 || erro "falta o Docker Compose v2 (pacote docker-compose-v2, docs/12, seção 12.2)."
  if ! docker info >/dev/null 2>&1; then
    erro "sem permissão para usar o Docker. Rode: sudo usermod -aG docker \$USER, saia do SSH e entre de novo."
  fi
}

# "Digite ZERAR para continuar". Com --sim (para scripts e para o CI), não pergunta.
confirmar() {
  local palavra="$1" resposta
  [[ "${SIM:-0}" == 1 ]] && return 0
  read -r -p "Digite ${palavra} para continuar (ou Enter para desistir): " resposta
  [[ "$resposta" == "$palavra" ]] || {
    echo "Nada foi feito."
    exit 1
  }
}

# Endereço do sistema visto de dentro da própria máquina (o Nginx)
url_base() {
  printf 'http://localhost:%s' "$(ler_env HTTP_PORTA | grep -E '^[0-9]+$' || echo 80)"
}

# Código HTTP de uma requisição (000 se não respondeu)
codigo_http() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@" || true
}

# Um texto como string JSON (com as aspas e as barras escapadas)
json_texto() {
  local s="${1//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '"%s"' "$s"
}

# Uma consulta no banco central, só o valor (sem cabeçalho)
consultar() {
  docker compose exec -T db psql -U postgres -d medicalfield -v ON_ERROR_STOP=1 -At -c "$1" </dev/null
}

# docker compose sem a lista de cada container (ela é longa); se der erro, mostra tudo o que ele disse
compose_quieto() {
  local registro
  registro="$(mktemp)"
  if ! docker compose "$@" >"$registro" 2>&1; then
    cat "$registro" >&2
    rm -f "$registro"
    erro "docker compose $* falhou (acima, a mensagem dele)."
  fi
  rm -f "$registro"
}

banco_no_ar() {
  [[ "$(docker inspect --format '{{.State.Status}}' medicalfield-db 2>/dev/null || true)" == running ]]
}

# Constrói as imagens uma de cada vez: compilar as quatro juntas pode passar da memória de uma VM pequena
construir_imagens() {
  local i=0 servico
  for servico in "${SERVICOS_COM_BUILD[@]}"; do
    i=$((i + 1))
    titulo "Construindo $servico ($i/${#SERVICOS_COM_BUILD[@]})"
    por_baixo "docker compose build $servico"
    docker compose build "$servico"
  done
}

# Pouca memória para compilar? (Maven e o build do portal são os que mais pedem)
avisar_memoria_para_build() {
  local memoria swap
  memoria="$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo 2>/dev/null || echo 0)"
  swap="$(awk '/^SwapTotal:/ {print int($2 / 1024)}' /proc/meminfo 2>/dev/null || echo 0)"
  if ((memoria > 0 && memoria + swap < 3000)); then
    aviso "A VM tem ${memoria} MB de memória e ${swap} MB de swap. Se o build parar com \"killed\", crie um swap de 2 GB (docs/12, seção 12.12) e rode de novo."
  fi
}
