# Instala o MedicalField no Windows (Docker Desktop): a versao PowerShell do instalar.sh.
# Faz a configuracao (infra\.env), as chaves dos tokens, as imagens, sobe tudo, carrega os dados de
# demonstracao e confere. Pode rodar de novo quando quiser: o que ja existe fica como esta (os dados nao
# sao apagados) e a senha das contas de demonstracao e regravada com a do .env.
#
# Uso, no PowerShell, da pasta do repositorio (com o Docker Desktop aberto):
#   powershell -ExecutionPolicy Bypass -File infra\scripts\instalar.ps1
#
# O "-ExecutionPolicy Bypass" e porque o Windows, por padrao, nao roda scripts .ps1.
# Sem perguntas (para automatizar): defina antes $env:DEMO_SENHA.

. (Join-Path $PSScriptRoot '_comum.ps1')

Titulo 'Docker'
ExigirDocker
Ok 'Docker Desktop respondendo.'

Titulo 'Configuracao (fica so no infra\.env desta maquina)'
if (-not (Test-Path $ARQUIVO_ENV)) {
    PorBaixo 'Copy-Item .env.example .env'
    Copy-Item (Join-Path $INFRA '.env.example') $ARQUIVO_ENV
    Ok 'Criado o infra\.env (o banco ja vem com usuario postgres e senha postgres).'
}
$demo = LerEnv 'DEMO_SENHA'
if ($demo -and -not $demo.StartsWith('troque-esta-senha')) {
    Ok 'infra\.env ja configurado.'
} elseif ($env:DEMO_SENHA) {
    GravarEnv 'DEMO_SENHA' $env:DEMO_SENHA
    Ok 'DEMO_SENHA gravada no infra\.env.'
} else {
    Write-Host 'Senha das contas de demonstracao (Dr. Ricardo, Dra. Ana...): e com ela que se entra no portal e no app.'
    while ($true) {
        $senha = TextoDe (Read-Host '  DEMO_SENHA' -AsSecureString)
        $repetida = TextoDe (Read-Host '  Repita' -AsSecureString)
        if ($senha -cne $repetida) { Write-Host '  As duas nao sao iguais. De novo.' }
        elseif ($senha.Length -lt 6) { Write-Host '  Use pelo menos 6 caracteres.' }
        elseif ($senha -match "[`"' ]") { Write-Host '  Use uma senha sem aspas e sem espacos.' }
        else { break }
    }
    GravarEnv 'DEMO_SENHA' $senha
    Ok 'DEMO_SENHA gravada no infra\.env.'
}
if (-not (LerEnv 'SMTP_HOST')) { Aviso 'SMTP_HOST vazio: o sistema sobe, mas o envio de e-mail fica desligado (docs/12, secao 12.8).' }

Titulo 'Chaves dos tokens'
GerarChavesJwt

AvisarMemoriaParaBuild
ConstruirImagens

Titulo 'Subindo tudo'
PorBaixo 'docker compose up -d --wait'
& docker compose up -d --wait
if ($LASTEXITCODE -ne 0) {
    Erro 'algum servico nao ficou saudavel. Veja qual com "docker compose ps" e o motivo com "docker compose logs <servico>" (ex.: docker compose logs ms-auth).'
}

Titulo 'Dados de demonstracao'
CarregarDemo
Ok 'Contas, medicamentos, pessoas, prontuarios e atendimentos de demonstracao carregados.'

Titulo 'Conferindo'
& (Join-Path $PSScriptRoot 'verificar.ps1')
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host ''
Write-Host "Pronto. Portal: $(UrlBase)/" -ForegroundColor White
