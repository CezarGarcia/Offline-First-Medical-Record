#!/usr/bin/env bash
# Funções usadas pelos outros scripts desta pasta (não precisa rodar este arquivo).
# Todos os scripts trabalham dentro de infra/, com o docker-compose.yml e o .env de lá.
set -euo pipefail

INFRA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$INFRA"

# Os serviços que o projeto constrói (os outros vêm prontos do Docker Hub)
SERVICOS_COM_BUILD=(ms-auth ms-clinico ms-docs nginx)

# Docker com sudo (D-50). Na VM do projeto, o usuário não pode entrar no grupo docker (a Univates bloqueia o
# usermod), mas tem sudo sem senha. Então, se o Docker só responde com sudo, todo "docker" dos scripts vira
# "sudo docker". Os arquivos (.env, backups) continuam do usuário. "command docker" pula esta função.
COM_SUDO=0
if [[ $EUID -ne 0 ]] && command -v docker >/dev/null && ! command docker info >/dev/null 2>&1 &&
  command -v sudo >/dev/null && sudo -n docker info >/dev/null 2>&1; then
  COM_SUDO=1
  docker() { sudo docker "$@"; }
  export -f docker
fi

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
por_baixo() {
  local comando="$*"
  ((COM_SUDO)) && [[ "$comando" == docker* ]] && comando="sudo $comando"
  printf '  %s$ %s%s\n' "$_cinza" "$comando" "$_fim"
}
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

# Troca (ou acrescenta) uma variável no infra/.env. Valores com espaço ou símbolo vão entre aspas simples.
gravar_env() {
  local valor="$2" linha novo
  [[ "$valor" =~ ^[A-Za-z0-9_@.:/+=-]*$ ]] || valor="'$valor'"
  novo="$(mktemp)"
  if grep -qE "^$1=" .env; then
    while IFS= read -r linha || [[ -n "$linha" ]]; do
      if [[ "$linha" == "$1="* ]]; then printf '%s=%s\n' "$1" "$valor"; else printf '%s\n' "$linha"; fi
    done <.env >"$novo"
  else
    cat .env >"$novo"
    printf '%s=%s\n' "$1" "$valor" >>"$novo"
  fi
  cat "$novo" >.env
  rm -f "$novo"
}

exigir_env() {
  [[ -f .env ]] || erro "falta o infra/.env. Rode ./infra/scripts/instalar.sh."
}

exigir_docker() {
  command -v docker >/dev/null || erro "o Docker não está instalado (docs/12, seção 12.2)."
  docker compose version >/dev/null 2>&1 || erro "falta o Docker Compose v2 (pacote docker-compose-v2, docs/12, seção 12.2)."
  if ! docker info >/dev/null 2>&1; then
    erro "sem permissão para usar o Docker. Rode: sudo usermod -aG docker \$USER, saia do SSH e entre de novo (se o usermod for bloqueado, como na VM do projeto, os scripts usam o sudo sozinhos quando ele não pede senha)."
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

# Chaves RSA dos tokens (D-06): a privada só o ms-auth usa (assina); a pública, os três serviços (conferem).
# Ficam em infra/secrets (fora do Git). Gerar de novo invalida os tokens já emitidos.
gerar_chaves_jwt() {
  local pasta="$INFRA/secrets"
  if [[ -f "$pasta/jwt-privada.pem" && -f "$pasta/jwt-publica.pem" ]]; then
    ok "Chaves dos tokens: já existem (infra/secrets)."
    return
  fi
  command -v openssl >/dev/null || erro "falta o openssl (sudo apt install -y openssl)."
  mkdir -p "$pasta"
  chmod 700 "$pasta"
  por_baixo "openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out secrets/jwt-privada.pem"
  openssl genpkey -quiet -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$pasta/jwt-privada.pem"
  openssl pkey -in "$pasta/jwt-privada.pem" -pubout -out "$pasta/jwt-publica.pem"
  # Legíveis dentro dos containers; a pasta (700) é que fica restrita ao usuário da máquina
  chmod 644 "$pasta/jwt-privada.pem" "$pasta/jwt-publica.pem"
  ok "Chaves dos tokens geradas em infra/secrets."
}

# O psql como postgres enxerga as tabelas dos quatro schemas sem o prefixo (\dt lista tudo; SELECT * FROM pessoa)
mostrar_schemas_no_psql() {
  consultar "ALTER ROLE postgres IN DATABASE medicalfield SET search_path = clinico, auth, documentos, auditoria, public" >/dev/null
}

# Dados de demonstração (docs/11, seção 11.2): contas com a DEMO_SENHA, medicamentos, pessoas e atendimentos.
# Pode rodar de novo: não duplica, e regrava a senha das contas (também desbloqueia e reativa).
carregar_demo() {
  local senha tabelas
  senha="$(ler_env DEMO_SENHA)"
  [[ -n "$senha" && "$senha" != troque-esta-senha* ]] || erro "defina a DEMO_SENHA no infra/.env."
  por_baixo "docker compose exec -T db psql -U postgres -d medicalfield -f - < seed/01-profissionais.sql"
  docker compose exec -T db psql -U postgres -d medicalfield -v ON_ERROR_STOP=1 -q -v senha="$senha" -f - <seed/01-profissionais.sql >/dev/null
  # </dev/null: sem isso, o "docker compose exec" fica esperando o que se digita no terminal
  tabelas="$(consultar "SELECT to_regclass('clinico.pessoa') IS NOT NULL")"
  [[ "$tabelas" == t ]] || erro "o ms-clinico ainda não criou as tabelas dele (veja: cd infra && sudo docker compose logs ms-clinico)."
  por_baixo "docker compose exec -T db psql -U postgres -d medicalfield -f - < seed/02-clinico.sql"
  docker compose exec -T db psql -U postgres -d medicalfield -v ON_ERROR_STOP=1 -q -f - <seed/02-clinico.sql >/dev/null
  mostrar_schemas_no_psql
}

# Endereço desta máquina, para mostrar no fim (o primeiro IP da máquina)
endereco_da_maquina() {
  local ip porta
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  porta="$(ler_env HTTP_PORTA)"
  [[ "$porta" =~ ^(80|)$ ]] && porta="" || porta=":$porta"
  printf 'http://%s%s/' "${ip:-<endereço desta máquina>}" "$porta"
}
