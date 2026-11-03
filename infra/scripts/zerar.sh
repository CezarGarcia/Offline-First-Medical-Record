#!/usr/bin/env bash
# Volta o sistema para o começo do roteiro: apaga TODOS os dados (pessoas, prontuários, atendimentos,
# e-mails, conflitos e logs) e carrega de novo os dados de demonstração (docs/11, seção 11.2).
# Os logs de auditoria não podem ser apagados um a um (D-04): o banco inteiro é recriado.
# Antes, um backup vai para infra/backups/ (dá para voltar com ./infra/scripts/restaurar.sh).
#
# Uso: ./infra/scripts/zerar.sh [--sim]      (--sim não pergunta nada: para scripts e para o CI)
source "$(dirname "$0")/_comum.sh"
exigir_docker
exigir_env
SIM=0
[[ "${1:-}" == --sim ]] && SIM=1

echo "Isto APAGA todos os dados do servidor e recarrega os dados de demonstração."
confirmar ZERAR

if banco_no_ar; then
  titulo "Backup antes de zerar"
  "$INFRA/scripts/backup.sh" antes-de-zerar
fi
titulo "Recriando o banco"
compose_quieto down -v
ok "Banco apagado."
compose_quieto up -d --wait
ok "Serviços no ar, com o banco novo."
titulo "Dados de demonstração"
"$INFRA/scripts/popular-demo.sh" >/dev/null
read -r profissionais medicamentos pessoas atendimentos <<<"$(consultar "SELECT (SELECT count(*) FROM auth.profissional) || ' ' ||
  (SELECT count(*) FROM clinico.medicamento) || ' ' || (SELECT count(*) FROM clinico.pessoa) || ' ' || (SELECT count(*) FROM clinico.atendimento)")"
ok "$profissionais profissionais, $medicamentos medicamentos, $pessoas pessoas com prontuário e $atendimentos atendimentos"
echo
echo "Servidor pronto para o roteiro. Nos notebooks, apague também os dados do app cliente"
echo "(apps/cliente/scripts/apagar-dados-locais.cmd): eles ainda têm os registros do ensaio."
