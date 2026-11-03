#!/usr/bin/env bash
# Passo 9 do roteiro (docs/11, seção 11.3): insere um medicamento DIRETO no banco, sem passar pela API.
# Os passos 10 e 11 mostram que ele aparece no portal e, depois de sincronizar, no app cliente.
# Se já existir um medicamento com o mesmo nome, nada muda (para não duplicar num segundo ensaio).
#
# Uso: ./infra/scripts/medicamento.sh [nome] [apresentação] [unidade]
#      sem nada: Cetoprofeno, Frasco-ampola 100 mg, MG (o do roteiro)
source "$(dirname "$0")/_comum.sh"
exigir_docker
banco_no_ar || erro "o banco não está no ar."

nome="${1:-Cetoprofeno}"
apresentacao="${2:-Frasco-ampola 100 mg}"
unidade="$(printf '%s' "${3:-MG}" | tr '[:lower:]' '[:upper:]')"
case "$unidade" in
  MG | MCG | G | ML | UI | GOTA | COMPRIMIDO | AMPOLA | OUTRA) ;;
  *) erro "unidade inválida: $unidade (use MG, MCG, G, ML, UI, GOTA, COMPRIMIDO, AMPOLA ou OUTRA)" ;;
esac
sql_texto() { printf "'%s'" "${1//\'/\'\'}"; }

sql="INSERT INTO clinico.medicamento (nome, apresentacao, unidade_padrao)
SELECT $(sql_texto "$nome"), $(sql_texto "$apresentacao"), '$unidade'
WHERE NOT EXISTS (SELECT 1 FROM clinico.medicamento WHERE lower(nome) = lower($(sql_texto "$nome")));"
por_baixo "docker compose exec db psql -U postgres -d medicalfield      (e, dentro do psql, este SQL:)"
echo "$sql"
echo
resultado="$(docker compose exec -T db psql -U postgres -d medicalfield -v ON_ERROR_STOP=1 -c "$sql" </dev/null)"
echo "$resultado"
if [[ "$resultado" == "INSERT 0 1" ]]; then
  ok "$nome inserido direto no banco. No portal, Medicamentos; no app cliente, depois de Sincronizar."
else
  aviso "Já existia um medicamento chamado $nome: nada mudou. Para recomeçar o roteiro: ./infra/scripts/zerar.sh"
fi
