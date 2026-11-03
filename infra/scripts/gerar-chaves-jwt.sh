#!/usr/bin/env bash
# Gera o par de chaves RSA dos tokens JWT (algoritmo RS256).
#   jwt-privada.pem -> só o ms-auth usa (assina os tokens)
#   jwt-publica.pem -> ms-clinico e ms-docs usam (só conferem os tokens)
#
# Rode uma vez na VM e uma vez no ambiente de desenvolvimento.
# Os arquivos ficam em infra/secrets/, que NÃO vai para o Git.
# Gerar chaves novas invalida todos os tokens já emitidos (todo mundo precisa logar de novo).
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/secrets"
mkdir -p "$DIR"
chmod 700 "$DIR"

if [[ -f "$DIR/jwt-privada.pem" ]]; then
  echo "As chaves já existem em $DIR. Para gerar novas, apague os dois arquivos .pem antes."
  exit 0
fi

openssl genpkey -quiet -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$DIR/jwt-privada.pem"
openssl pkey -in "$DIR/jwt-privada.pem" -pubout -out "$DIR/jwt-publica.pem"
# Legíveis dentro dos containers; a pasta (700) é que fica restrita ao usuário da VM
chmod 644 "$DIR/jwt-privada.pem" "$DIR/jwt-publica.pem"

echo "Chaves geradas em $DIR"
