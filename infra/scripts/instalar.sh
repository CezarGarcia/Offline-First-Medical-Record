#!/usr/bin/env bash
# Primeira instalação (na VM ou num PC com Docker): prepara o .env, as chaves dos tokens, constrói as imagens
# uma de cada vez, sobe tudo, carrega os dados de demonstração e confere. Pode rodar de novo sem problema.
#
# Uso (de qualquer pasta do repositório):
#   ./infra/scripts/instalar.sh
# Na primeira vez, ele cria o infra/.env com senhas novas para o banco e para; aí é só definir a DEMO_SENHA
# (e o e-mail) nesse arquivo e rodar de novo. Ver docs/12, seção 12.4.
source "$(dirname "$0")/_comum.sh"
exigir_docker
command -v openssl >/dev/null || erro "falta o openssl (sudo apt install -y openssl)."

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  for chave in POSTGRES_PASSWORD MS_AUTH_DB_PASSWORD MS_CLINICO_DB_PASSWORD MS_DOCS_DB_PASSWORD; do
    gravar_env "$chave" "$(openssl rand -hex 16)"
  done
  ok "Criado o infra/.env, com senhas novas e aleatórias para o banco."
  echo
  echo "Agora, no infra/.env (nano infra/.env):"
  echo "  1. DEMO_SENHA: a senha das contas de demonstração (forte, só sua; não publique)."
  echo "  2. O e-mail (SMTP_*), para o envio da ficha: docs/12, seção 12.8."
  echo "Depois rode ./infra/scripts/instalar.sh de novo."
  exit 0
fi

pendentes=()
for chave in POSTGRES_PASSWORD MS_AUTH_DB_PASSWORD MS_CLINICO_DB_PASSWORD MS_DOCS_DB_PASSWORD DEMO_SENHA; do
  valor="$(ler_env "$chave")"
  [[ -z "$valor" || "$valor" == troque-esta-senha* ]] && pendentes+=("$chave")
done
((${#pendentes[@]} == 0)) || erro "troque no infra/.env: ${pendentes[*]}"
[[ -n "$(ler_env SMTP_HOST)" ]] || aviso "SMTP_HOST vazio: o sistema sobe, mas o envio de e-mail fica desligado (docs/12, seção 12.8)."

titulo "Chaves dos tokens"
"$INFRA/scripts/gerar-chaves-jwt.sh"

avisar_memoria_para_build
construir_imagens

titulo "Subindo tudo"
docker compose up -d --wait

titulo "Dados de demonstração"
"$INFRA/scripts/popular-demo.sh" >/dev/null
ok "Contas, medicamentos, pessoas, prontuários e atendimentos de demonstração carregados."

titulo "Conferindo"
"$INFRA/scripts/verificar.sh"
echo
echo "Portal: http://<endereço desta máquina>$( [[ "$(ler_env HTTP_PORTA)" =~ ^(80|)$ ]] || echo ":$(ler_env HTTP_PORTA)")/"
