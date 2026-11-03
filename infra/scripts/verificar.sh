#!/usr/bin/env bash
# Confere se o sistema está pronto para a apresentação: containers, rotas pelo Nginx, login das contas de
# demonstração, dados, e-mail, disco e memória. Não muda nada. Rode antes de começar (e depois de mexer).
#
# Uso (de qualquer pasta do repositório):
#   ./infra/scripts/verificar.sh
source "$(dirname "$0")/_comum.sh"
exigir_docker
exigir_env

problemas=0
avisos=0
problema() {
  falha "$@"
  problemas=$((problemas + 1))
}
atencao() {
  aviso "$@"
  avisos=$((avisos + 1))
}
URL="$(url_base)"

titulo "Containers"
for servico in db ms-auth ms-clinico ms-docs nginx; do
  estado="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "medicalfield-$servico" 2>/dev/null || echo ausente)"
  case "$estado" in
    "running healthy") ok "$servico: no ar" ;;
    "running starting") atencao "$servico: subindo (espere uns segundos e rode de novo)" ;;
    "running ") ok "$servico: no ar" ;;
    *) problema "$servico: ${estado} (logs: ./infra/scripts/servico.sh logs $servico)" ;;
  esac
done

titulo "Rotas pelo Nginx ($URL)"
[[ "$(codigo_http "$URL/")" == 200 ]] && ok "portal: a tela de login abre" || problema "portal: $URL/ não respondeu 200"
for par in "/api/auth/me ms-auth" "/api/pessoa ms-clinico" "/api/documentos/email ms-docs"; do
  rota="${par% *}" servico="${par#* }"
  codigo="$(codigo_http "$URL$rota")"
  if [[ "$codigo" == 401 ]]; then
    ok "$servico: responde (401 sem token, como deve ser)"
  else
    problema "$servico: $rota respondeu $codigo (esperado: 401)"
  fi
done

titulo "Contas de demonstração"
senha="$(ler_env DEMO_SENHA)"
if [[ -z "$senha" || "$senha" == troque-esta-senha-de-demo ]]; then
  problema "DEMO_SENHA não está definida no infra/.env"
else
  for par in "10001-RS admin (Dr. Ricardo)" "12345-RS operacional (Dra. Ana)"; do
    registro="${par%% *}" quem="${par#* }"
    codigo="$(codigo_http -X POST -H 'Content-Type: application/json' \
      -d "{\"tipoRegistro\":\"CRM\",\"registro\":\"$registro\",\"senha\":$(json_texto "$senha")}" "$URL/api/auth/login")"
    case "$codigo" in
      200) ok "login do $quem" ;;
      401)
        # Não tenta a outra conta: cada senha errada conta para o bloqueio (5 seguidas = 5 minutos)
        problema "login do $quem recusado: a DEMO_SENHA do .env não é a gravada no banco. Rode ./infra/scripts/popular-demo.sh para gravar a do .env"
        break
        ;;
      403) problema "login do $quem: conta desativada. ./infra/scripts/popular-demo.sh reativa as contas de demonstração" ;;
      423) problema "login do $quem: conta bloqueada por senhas erradas. ./infra/scripts/popular-demo.sh desbloqueia (ou espere 5 minutos)" ;;
      *) problema "login do $quem respondeu $codigo (o ms-auth está no ar?)" ;;
    esac
  done
fi

titulo "Dados"
if banco_no_ar; then
  if contagem="$(consultar "SELECT (SELECT count(*) FROM auth.profissional) || ' ' || (SELECT count(*) FROM clinico.medicamento)
      || ' ' || (SELECT count(*) FROM clinico.pessoa) || ' ' || (SELECT count(*) FROM clinico.prontuario)
      || ' ' || (SELECT count(*) FROM clinico.atendimento) || ' ' || (SELECT count(*) FROM documentos.envio_email)" 2>/dev/null)"; then
    read -r profissionais medicamentos pessoas prontuarios atendimentos emails <<<"$contagem"
    ok "$profissionais profissionais, $medicamentos medicamentos, $pessoas pessoas, $prontuarios prontuários, $atendimentos atendimentos, $emails e-mails enviados"
    ((profissionais >= 4)) || problema "faltam as contas de demonstração: ./infra/scripts/popular-demo.sh"
    if ((pessoas > 2 || atendimentos > 2)); then
      atencao "há registros além dos de demonstração (de ensaios?). O roteiro espera 2 prontuários e 2 atendimentos nos passos 3 e 4: para recomeçar, ./infra/scripts/zerar.sh"
    fi
    if [[ "$(consultar "SELECT count(*) FROM clinico.medicamento WHERE lower(nome) = 'cetoprofeno'")" != 0 ]]; then
      atencao "o Cetoprofeno já está no banco: o passo 9 do roteiro (inserir o medicamento) não vai mostrar nada novo"
    fi
  else
    problema "não consegui ler as tabelas (os serviços já criaram as tabelas deles?)"
  fi
else
  problema "o banco não está no ar"
fi

titulo "E-mail"
smtp="$(ler_env SMTP_HOST)"
if [[ -z "$smtp" ]]; then
  problema "envio de e-mail desligado (SMTP_HOST vazio no infra/.env): o passo 17 vai falhar. Ver docs/12, seção 12.8"
elif [[ "$smtp" == smtp-teste ]]; then
  atencao "os e-mails vão para o Mailpit (servidor de teste), não para uma caixa de verdade: http://localhost:8025"
else
  ok "envio pelo $smtp:$(ler_env SMTP_PORTA) (para testar de verdade: ./infra/scripts/testar-email.sh <seu e-mail>)"
fi
ok "estratégia de conflitos: $(ler_env ESTRATEGIA_CONFLITO | grep . || echo MAIS_RECENTE_VENCE)"

titulo "Máquina"
[[ -f secrets/jwt-privada.pem && -f secrets/jwt-publica.pem ]] && ok "chaves dos tokens em infra/secrets/" || problema "faltam as chaves dos tokens: ./infra/scripts/gerar-chaves-jwt.sh"
# As senhas do banco são simples e estão no repositório (D-49): a porta dele não pode ficar aberta para fora
porta_banco="$(docker port medicalfield-db 5432/tcp 2>/dev/null | head -1 || true)"
case "$porta_banco" in
  "") ;; # banco fora do ar: já aparece em "Containers"
  127.0.0.1:*)
    [[ "$(ler_env POSTGRES_PASSWORD)" == postgres ]] && quem="usuário postgres, senha postgres" || quem="usuário postgres, senha do POSTGRES_PASSWORD"
    ok "banco em $porta_banco, só para esta máquina ($quem; do PC, pelo túnel SSH: docs/12, seção 12.6)"
    ;;
  *) problema "a porta do banco está aberta para fora ($porta_banco). Com as senhas do .env.example, ela tem de ficar em 127.0.0.1 (D-49)" ;;
esac
raiz="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /)"
livre_mb="$(df -Pm "$raiz" 2>/dev/null | awk 'NR == 2 {print $4}')"
if [[ -n "$livre_mb" ]]; then
  if ((livre_mb < 1024)); then
    problema "só $((livre_mb / 1024)) GB livres no disco do Docker. Libere espaço: docker image prune -f"
  elif ((livre_mb < 3072)); then
    atencao "$((livre_mb / 1024)) GB livres no disco do Docker (pouco para atualizar as imagens)"
  else
    ok "$((livre_mb / 1024)) GB livres no disco do Docker"
  fi
fi
disponivel="$(awk '/^MemAvailable:/ {print int($2 / 1024)}' /proc/meminfo 2>/dev/null || echo 0)"
((disponivel == 0 || disponivel >= 300)) && ok "${disponivel} MB de memória livre" || atencao "só ${disponivel} MB de memória livre"
ok "hora: $(date -u '+%d/%m/%Y %H:%M') UTC ($(TZ=America/Sao_Paulo date '+%H:%M') em Brasília)"

echo
if ((problemas == 0 && avisos == 0)); then
  printf '%sTudo pronto.%s\n' "$_verde" "$_fim"
elif ((problemas == 0)); then
  printf '%sTudo no ar, com %d aviso(s) acima.%s\n' "$_amarelo" "$avisos" "$_fim"
else
  printf '%s%d problema(s) acima.%s\n' "$_vermelho" "$problemas" "$_fim"
  exit 1
fi
