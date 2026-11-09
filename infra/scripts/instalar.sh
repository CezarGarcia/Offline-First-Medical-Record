#!/usr/bin/env bash
# Instala o MedicalField e deixa tudo no ar: Docker (se faltar), o código, a configuração, as chaves dos
# tokens, as imagens, o banco com os dados de demonstração e a conferência final. Pode rodar de novo quando
# quiser: o que já existe fica como está (os dados não são apagados).
#
# Numa VM nova, sem nada (baixa este script e ele clona o repositório em ~/offline-first-medical-record):
#   curl -fsSL https://raw.githubusercontent.com/CezarGarcia/offline-first-medical-record/main/infra/scripts/instalar.sh | bash
#
# De dentro do repositório:
#   ./infra/scripts/instalar.sh
#
# Na primeira vez, ele pergunta a senha das contas de demonstração (DEMO_SENHA) e, se quiser, o Gmail que
# envia as fichas. As respostas ficam só no infra/.env desta máquina. Ver docs/12, seção 12.4.
#
# Tudo dentro de funções, chamadas na última linha: pelo "curl | bash", o bash lê o script inteiro antes de rodar.

set -euo pipefail
REPOSITORIO="${MEDICALFIELD_REPOSITORIO:-https://github.com/CezarGarcia/offline-first-medical-record.git}"
PASTA="${MEDICALFIELD_PASTA:-$HOME/offline-first-medical-record}"

# Docker, Compose e Git pelos pacotes do Ubuntu (docs/12, seção 12.2), só se faltar algum
instalar_pacotes_que_faltam() {
  if command -v docker >/dev/null && docker compose version >/dev/null 2>&1 && command -v git >/dev/null &&
    command -v openssl >/dev/null && command -v curl >/dev/null; then
    return
  fi
  echo "Instalando Docker, Docker Compose e Git (sudo apt)..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker.io docker-compose-v2 docker-buildx git openssl curl >/dev/null
  sudo systemctl enable --now docker >/dev/null 2>&1 || true
}

# Rodando pela URL: clona (ou atualiza) o repositório e continua com a cópia de lá
continuar_no_repositorio() {
  if [[ -d "$PASTA/.git" ]]; then
    echo "Atualizando o código em $PASTA..."
    git -C "$PASTA" pull --ff-only -q
  else
    echo "Baixando o código para $PASTA..."
    git clone -q "$REPOSITORIO" "$PASTA"
  fi
  # A entrada passa a ser o terminal (pelo "curl | bash", ela era o próprio script)
  if (: </dev/tty) 2>/dev/null; then
    exec bash "$PASTA/infra/scripts/instalar.sh" </dev/tty
  fi
  exec bash "$PASTA/infra/scripts/instalar.sh" </dev/null
}

# Pergunta a DEMO_SENHA e o Gmail (só no terminal; no GitHub Actions o .env é preenchido pelo workflow)
perguntar_configuracao() {
  local senha confirmacao gmail senha_app
  titulo "Configuração (fica só no infra/.env desta máquina)"
  echo "Senha das contas de demonstração (Dr. Ricardo, Dra. Ana...). Ela protege o portal, que fica"
  echo "aberto na internet: fácil de digitar, mas só sua."
  while true; do
    read -r -s -p "  DEMO_SENHA: " senha
    echo
    read -r -s -p "  Repita: " confirmacao
    echo
    if [[ "$senha" != "$confirmacao" ]]; then
      echo "  As duas não são iguais. De novo."
    elif ((${#senha} < 6)); then
      echo "  Use pelo menos 6 caracteres."
    elif [[ "$senha" == *"'"* ]]; then
      echo "  Use uma senha sem aspas simples (')."
    else
      break
    fi
  done
  gravar_env DEMO_SENHA "$senha"

  echo
  echo "Envio das fichas por e-mail: um Gmail com senha de app (docs/12, seção 12.8). Enter para pular."
  read -r -p "  Gmail: " gmail
  if [[ -n "$gmail" ]]; then
    read -r -s -p "  Senha de app (16 letras): " senha_app
    echo
    gravar_env SMTP_HOST smtp.gmail.com
    gravar_env SMTP_PORTA 587
    gravar_env SMTP_USUARIO "$gmail"
    gravar_env SMTP_SENHA "${senha_app// /}"
    gravar_env SMTP_REMETENTE "MedicalField <$gmail>"
    ok "E-mail: pelo $gmail."
  else
    aviso "E-mail desligado por enquanto. Para ligar depois: nano infra/.env (linhas SMTP_*) e rode este script de novo."
  fi
}

preparar_configuracao() {
  local novo=0 demo
  if [[ ! -f .env ]]; then
    por_baixo "cp .env.example .env"
    cp .env.example .env
    chmod 600 .env
    novo=1
    ok "Criado o infra/.env (o banco já vem com usuário postgres e senha postgres; ele só abre dentro desta máquina)."
  fi
  demo="$(ler_env DEMO_SENHA)"
  if [[ -n "$demo" && "$demo" != troque-esta-senha* ]]; then
    return
  fi
  if [[ -n "${DEMO_SENHA:-}" ]]; then
    gravar_env DEMO_SENHA "$DEMO_SENHA"
  elif [[ -t 0 ]]; then
    perguntar_configuracao
  elif ((novo)); then
    echo
    echo "Defina a DEMO_SENHA (e o e-mail, docs/12 seção 12.8) no infra/.env e rode este script de novo."
    exit 0
  else
    erro "defina a DEMO_SENHA no infra/.env (nano infra/.env) e rode de novo."
  fi
}

principal() {
  instalar_pacotes_que_faltam
  local aqui="${BASH_SOURCE[0]:-}"
  if [[ -z "$aqui" || ! -f "$(dirname "$aqui")/_comum.sh" ]]; then
    continuar_no_repositorio
  fi
  # shellcheck source=_comum.sh
  source "$(dirname "$aqui")/_comum.sh"
  exigir_docker

  titulo "Configuração"
  preparar_configuracao
  [[ -n "$(ler_env SMTP_HOST)" ]] || aviso "SMTP_HOST vazio: o sistema sobe, mas o envio de e-mail fica desligado (docs/12, seção 12.8)."

  titulo "Chaves dos tokens"
  gerar_chaves_jwt

  if [[ "${MEDICALFIELD_SEM_BUILD:-0}" == 1 ]]; then
    aviso "MEDICALFIELD_SEM_BUILD=1: usando as imagens que já existem nesta máquina."
  else
    avisar_memoria_para_build
    construir_imagens
  fi

  titulo "Subindo tudo"
  por_baixo "docker compose up -d --wait"
  docker compose up -d --wait

  titulo "Dados de demonstração"
  carregar_demo
  ok "Contas, medicamentos, pessoas, prontuários e atendimentos de demonstração carregados."

  titulo "Conferindo"
  "$INFRA/scripts/verificar.sh"
  echo
  printf '%sPronto. Portal: %s%s\n' "$_negrito" "$(endereco_da_maquina)" "$_fim"
}

principal "$@"
