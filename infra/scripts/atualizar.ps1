# Atualiza o sistema para a versao mais nova do repositorio (a versao Windows do atualizar.sh): baixa o codigo,
# reconstroi as imagens (uma de cada vez), sobe de novo e confere. Os dados ficam (o volume do banco nao muda);
# as migrations rodam sozinhas.
#
# Uso, no PowerShell, da pasta do repositorio (com o Docker Desktop aberto):
#   powershell -ExecutionPolicy Bypass -File infra\scripts\atualizar.ps1

. (Join-Path $PSScriptRoot '_comum.ps1')
ExigirDocker
ExigirEnv

Titulo 'Codigo'
PorBaixo 'git pull --ff-only'
& git -C (Split-Path -Parent $INFRA) pull --ff-only
if ($LASTEXITCODE -ne 0) { Erro 'nao deu para atualizar o codigo (ha mudancas locais nos arquivos? git status).' }

AvisarMemoriaParaBuild
ConstruirImagens

Titulo 'Subindo a versao nova'
PorBaixo 'docker compose up -d --wait --remove-orphans'
& docker compose up -d --wait --remove-orphans
if ($LASTEXITCODE -ne 0) {
    Erro 'algum servico nao ficou saudavel. Veja qual com "docker compose ps" e o motivo com "docker compose logs <servico>".'
}
# As imagens antigas ficam sem nome e so ocupam disco
PorBaixo 'docker image prune -f'
$null = DockerResponde image prune -f

MostrarSchemasNoPsql

Titulo 'Conferindo'
& (Join-Path $PSScriptRoot 'verificar.ps1')
exit $LASTEXITCODE
