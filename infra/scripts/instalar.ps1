# Instala o MedicalField no Windows (Docker Desktop): a versao PowerShell do instalar.sh.
# Faz a configuracao (infra\.env), as chaves dos tokens, as imagens, sobe tudo e carrega os dados de demonstracao.
# Pode rodar de novo quando quiser: o que ja existe fica como esta (os dados nao sao apagados).
#
# Uso, no PowerShell, de qualquer pasta do repositorio (com o Docker Desktop aberto):
#   powershell -ExecutionPolicy Bypass -File infra\scripts\instalar.ps1
#
# O "-ExecutionPolicy Bypass" e porque o Windows, por padrao, nao roda scripts .ps1 baixados.
# Este arquivo fica so com ASCII: o PowerShell 5 le scripts sem BOM como ANSI e estragaria os acentos.

$ErrorActionPreference = 'Stop'
$infra = Split-Path -Parent $PSScriptRoot
Set-Location $infra
$arquivoEnv = Join-Path $infra '.env'
$utf8SemBom = New-Object System.Text.UTF8Encoding($false)

function Titulo($texto) { Write-Host ''; Write-Host $texto -ForegroundColor White }
function Ok($texto) { Write-Host "  OK $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "  !  $texto" -ForegroundColor Yellow }
function PorBaixo($texto) { Write-Host "  `$ $texto" -ForegroundColor DarkGray }
function Erro($texto) { Write-Host "Erro: $texto" -ForegroundColor Red; exit 1 }

# Roda o docker e para tudo se ele falhar. (O PowerShell 5 nao para sozinho quando um programa externo falha.)
function RodarDocker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { Erro "docker $($args -join ' ') falhou (acima, a mensagem dele)." }
}

# Testa se um comando do docker funciona, sem mostrar nada. (No PowerShell 5, redirecionar a saida de erro
# de um programa externo com o ErrorActionPreference em Stop vira erro do proprio script; o cmd evita isso.)
function DockerResponde($argumentos) {
    cmd /c "docker $argumentos >nul 2>&1"
    return ($LASTEXITCODE -eq 0)
}

# O .env e lido e gravado sempre em UTF-8 sem BOM e com fim de linha LF, como no Linux
function LerEnv($nome) {
    if (-not (Test-Path $arquivoEnv)) { return '' }
    $valor = ''
    foreach ($linha in [System.IO.File]::ReadAllLines($arquivoEnv, $utf8SemBom)) {
        if ($linha.StartsWith("$nome=")) { $valor = $linha.Substring($nome.Length + 1).Trim() }
    }
    return $valor.Trim('"').Trim("'")
}

function GravarEnv($nome, $valor) {
    if ($valor -notmatch '^[A-Za-z0-9_@.:/+=-]*$') { $valor = "'$valor'" }
    $linhas = [System.Collections.Generic.List[string]]::new()
    $achou = $false
    foreach ($linha in [System.IO.File]::ReadAllLines($arquivoEnv, $utf8SemBom)) {
        if ($linha.StartsWith("$nome=")) { $linhas.Add("$nome=$valor"); $achou = $true } else { $linhas.Add($linha) }
    }
    if (-not $achou) { $linhas.Add("$nome=$valor") }
    [System.IO.File]::WriteAllText($arquivoEnv, (($linhas -join "`n") + "`n"), $utf8SemBom)
}

function TextoDe($seguro) {
    $ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro) }
}

# --- Docker ---------------------------------------------------------------------------------------------
Titulo 'Docker'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Erro 'o Docker nao esta instalado. Instale o Docker Desktop (https://www.docker.com/products/docker-desktop/) e rode de novo.'
}
if (-not (DockerResponde 'info')) { Erro 'o Docker nao respondeu. Abra o Docker Desktop, espere ele dizer que esta rodando e rode de novo.' }
if (-not (DockerResponde 'compose version')) { Erro 'falta o Docker Compose v2 (vem com o Docker Desktop; atualize-o).' }
Ok 'Docker Desktop respondendo.'

# --- Configuracao ---------------------------------------------------------------------------------------
Titulo 'Configuracao (fica so no infra\.env desta maquina)'
if (-not (Test-Path $arquivoEnv)) {
    PorBaixo 'Copy-Item .env.example .env'
    Copy-Item (Join-Path $infra '.env.example') $arquivoEnv
    Ok 'Criado o infra\.env (o banco ja vem com usuario postgres e senha postgres).'
}
$demo = LerEnv 'DEMO_SENHA'
if (-not $demo -or $demo.StartsWith('troque-esta-senha')) {
    Write-Host 'Senha das contas de demonstracao (Dr. Ricardo, Dra. Ana...): e com ela que se entra no portal e no app.'
    while ($true) {
        $senha = TextoDe (Read-Host '  DEMO_SENHA' -AsSecureString)
        $repetida = TextoDe (Read-Host '  Repita' -AsSecureString)
        if ($senha -ne $repetida) { Write-Host '  As duas nao sao iguais. De novo.' }
        elseif ($senha.Length -lt 6) { Write-Host '  Use pelo menos 6 caracteres.' }
        elseif ($senha -match "[`"' ]") { Write-Host '  Use uma senha sem aspas e sem espacos.' }
        else { break }
    }
    GravarEnv 'DEMO_SENHA' $senha
    $demo = $senha
    Ok 'DEMO_SENHA gravada no infra\.env.'
} else {
    Ok 'infra\.env ja configurado.'
}
if (-not (LerEnv 'SMTP_HOST')) { Aviso 'SMTP_HOST vazio: o sistema sobe, mas o envio de e-mail fica desligado (docs/12, secao 12.8).' }

# --- Chaves dos tokens ----------------------------------------------------------------------------------
Titulo 'Chaves dos tokens'
& (Join-Path $PSScriptRoot 'gerar-chaves-jwt.ps1')
if ($LASTEXITCODE -ne 0) { exit 1 }

# --- Imagens e subida -----------------------------------------------------------------------------------
$servicos = @('ms-auth', 'ms-clinico', 'ms-docs', 'nginx')
$i = 0
foreach ($servico in $servicos) {
    $i++
    Titulo "Construindo $servico ($i/$($servicos.Count))"
    PorBaixo "docker compose build $servico"
    RodarDocker compose build $servico
}

Titulo 'Subindo tudo'
PorBaixo 'docker compose up -d --wait'
& docker compose up -d --wait
if ($LASTEXITCODE -ne 0) {
    Erro 'algum servico nao ficou saudavel. Veja qual com "docker compose ps" e o motivo com "docker compose logs <servico>" (ex.: docker compose logs ms-auth).'
}

# --- Dados de demonstracao ------------------------------------------------------------------------------
# O PowerShell nao tem o "<" do bash: os arquivos vao primeiro para dentro do container do banco
Titulo 'Dados de demonstracao'
PorBaixo 'docker compose cp seed/01-profissionais.sql db:/tmp/01-profissionais.sql'
RodarDocker compose cp seed/01-profissionais.sql db:/tmp/01-profissionais.sql
RodarDocker compose cp seed/02-clinico.sql db:/tmp/02-clinico.sql
PorBaixo 'docker compose exec -T db psql -U postgres -d medicalfield -v senha=... -f /tmp/01-profissionais.sql'
RodarDocker compose exec -T db psql -U postgres -d medicalfield -v ON_ERROR_STOP=1 -q -o /dev/null -v "senha=$demo" -f /tmp/01-profissionais.sql
PorBaixo 'docker compose exec -T db psql -U postgres -d medicalfield -f /tmp/02-clinico.sql'
RodarDocker compose exec -T db psql -U postgres -d medicalfield -v ON_ERROR_STOP=1 -q -o /dev/null -f /tmp/02-clinico.sql
Ok 'Contas, medicamentos, pessoas, prontuarios e atendimentos de demonstracao carregados.'

# --- Conferindo -----------------------------------------------------------------------------------------
$porta = LerEnv 'HTTP_PORTA'
$endereco = if ($porta -and $porta -ne '80') { "http://localhost:$porta/" } else { 'http://localhost/' }
Titulo 'Conferindo'
try {
    $resposta = Invoke-WebRequest -Uri $endereco -UseBasicParsing -TimeoutSec 15
    Ok "Portal respondendo ($($resposta.StatusCode))."
} catch {
    Aviso "O portal nao respondeu em $endereco ($($_.Exception.Message))."
}
& docker compose ps

Write-Host ''
Write-Host "Pronto. Portal: $endereco (contas de demonstracao com a DEMO_SENHA; docs/11, secao 11.2)" -ForegroundColor White
