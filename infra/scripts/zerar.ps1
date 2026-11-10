# Volta o sistema para o comeco do roteiro (a versao Windows do zerar.sh): apaga TODOS os dados (pessoas,
# prontuarios, atendimentos, e-mails, conflitos e logs) e carrega de novo os dados de demonstracao
# (docs/11, secao 11.2). Os logs de auditoria nao podem ser apagados um a um (D-04): o banco inteiro e recriado.
#
# Uso, no PowerShell, da pasta do repositorio (com o Docker Desktop aberto):
#   powershell -ExecutionPolicy Bypass -File infra\scripts\zerar.ps1 [-Sim]
# (-Sim nao pergunta nada: para automatizar)
param([switch]$Sim)

. (Join-Path $PSScriptRoot '_comum.ps1')
ExigirDocker
ExigirEnv

Write-Host 'Isto APAGA todos os dados do servidor e recarrega os dados de demonstracao.'
Confirmar 'ZERAR' $Sim

Titulo 'Recriando o banco'
PorBaixo 'docker compose down -v'
ComposeQuieto down -v
Ok 'Banco apagado.'
PorBaixo 'docker compose up -d --wait'
ComposeQuieto up -d --wait
Ok 'Servicos no ar, com o banco novo.'

Titulo 'Dados de demonstracao'
CarregarDemo
$contagem = Consultar "SELECT (SELECT count(*) FROM auth.profissional) || ' ' || (SELECT count(*) FROM clinico.medicamento) || ' ' || (SELECT count(*) FROM clinico.pessoa) || ' ' || (SELECT count(*) FROM clinico.atendimento)"
$n = "$contagem" -split ' '
Ok "$($n[0]) profissionais, $($n[1]) medicamentos, $($n[2]) pessoas com prontuario e $($n[3]) atendimentos"
Write-Host ''
Write-Host 'Servidor pronto para o roteiro. Nos notebooks, apague tambem os dados do app cliente'
Write-Host '(apps\cliente\scripts\apagar-dados-locais.cmd): eles ainda tem os registros do ensaio.'
