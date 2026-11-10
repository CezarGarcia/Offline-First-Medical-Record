# Funcoes usadas pelos outros scripts .ps1 desta pasta (nao precisa rodar este arquivo): a versao Windows
# do _comum.sh. Todos os scripts trabalham dentro de infra\, com o docker-compose.yml e o .env de la.
#
# Este arquivo fica so com ASCII: o PowerShell 5 le scripts sem BOM como ANSI e estragaria os acentos.
#
# Cuidados do PowerShell 5 (o que vem no Windows) que explicam o jeito de algumas funcoes:
# - ele nao para quando um programa externo (docker, git) falha: o codigo de saida e conferido a mao;
# - com o ErrorActionPreference em Stop, a saida de erro de um programa externo redirecionada (2>) vira
#   erro do proprio script: as funcoes que redirecionam trocam para Continue so dentro delas;
# - ele estraga aspas duplas dentro de argumentos de programas externos: o SQL daqui so usa aspas simples.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # a barra de progresso do Invoke-WebRequest deixa tudo lento
$INFRA = Split-Path -Parent $PSScriptRoot
Set-Location $INFRA
$ARQUIVO_ENV = Join-Path $INFRA '.env'
$UTF8_SEM_BOM = New-Object System.Text.UTF8Encoding($false)

# Os servicos que o projeto constroi (os outros vem prontos do Docker Hub)
$SERVICOS_COM_BUILD = @('ms-auth', 'ms-clinico', 'ms-docs', 'nginx')

function Titulo($texto) { Write-Host ''; Write-Host $texto -ForegroundColor White }
function Ok($texto) { Write-Host "  OK $texto" -ForegroundColor Green }
function Falha($texto) { Write-Host "  X  $texto" -ForegroundColor Red }
function Aviso($texto) { Write-Host "  !  $texto" -ForegroundColor Yellow }
# O comando que o script roda por baixo: para fazer a mao, e so roda-lo na pasta infra\ (docs/12, secao 12.15)
function PorBaixo($texto) { Write-Host "  `$ $texto" -ForegroundColor DarkGray }
function Erro($texto) { Write-Host "Erro: $texto" -ForegroundColor Red; exit 1 }

# Roda o docker mostrando a saida e para tudo se ele falhar
function RodarDocker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { Erro "docker $($args -join ' ') falhou (acima, a mensagem dele)." }
}

# O docker responde a este comando? (sem mostrar nada)
function DockerResponde {
    $ErrorActionPreference = 'Continue'
    & docker @args *> $null
    return ($LASTEXITCODE -eq 0)
}

# docker compose sem a lista de cada container (ela e longa); se der erro, mostra tudo o que ele disse
function ComposeQuieto {
    $ErrorActionPreference = 'Continue'
    $saida = & docker compose @args 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) {
        $saida | Write-Host
        Erro "docker compose $($args -join ' ') falhou (acima, a mensagem dele)."
    }
}

# --- .env: lido e gravado sempre em UTF-8 sem BOM e com fim de linha LF, como no Linux -------------------
function LerEnv($nome) {
    if (-not (Test-Path $ARQUIVO_ENV)) { return '' }
    $valor = ''
    foreach ($linha in [System.IO.File]::ReadAllLines($ARQUIVO_ENV, $UTF8_SEM_BOM)) {
        if ($linha.StartsWith("$nome=")) { $valor = $linha.Substring($nome.Length + 1).Trim() }
    }
    return $valor.Trim('"').Trim("'")
}

# Troca (ou acrescenta) uma variavel no infra\.env. Valores com espaco ou simbolo vao entre aspas simples.
function GravarEnv($nome, $valor) {
    if ($valor -notmatch '^[A-Za-z0-9_@.:/+=-]*$') { $valor = "'$valor'" }
    $linhas = New-Object System.Collections.Generic.List[string]
    $achou = $false
    foreach ($linha in [System.IO.File]::ReadAllLines($ARQUIVO_ENV, $UTF8_SEM_BOM)) {
        if ($linha.StartsWith("$nome=")) { $linhas.Add("$nome=$valor"); $achou = $true } else { $linhas.Add($linha) }
    }
    if (-not $achou) { $linhas.Add("$nome=$valor") }
    [System.IO.File]::WriteAllText($ARQUIVO_ENV, (($linhas -join "`n") + "`n"), $UTF8_SEM_BOM)
}

function ExigirEnv {
    if (-not (Test-Path $ARQUIVO_ENV)) { Erro 'falta o infra\.env. Rode o infra\scripts\instalar.ps1.' }
}

function ExigirDocker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Erro 'o Docker nao esta instalado. Instale o Docker Desktop (https://www.docker.com/products/docker-desktop/) e rode de novo.'
    }
    if (-not (DockerResponde info)) { Erro 'o Docker nao respondeu. Abra o Docker Desktop, espere ele dizer que esta rodando e rode de novo.' }
    if (-not (DockerResponde compose version)) { Erro 'falta o Docker Compose v2 (vem com o Docker Desktop; atualize-o).' }
}

# "Digite ZERAR para continuar". Com -Sim (para scripts), nao pergunta.
function Confirmar($palavra, $sim) {
    if ($sim) { return }
    $resposta = Read-Host "Digite $palavra para continuar (ou Enter para desistir)"
    if ($resposta -cne $palavra) { Write-Host 'Nada foi feito.'; exit 1 }
}

# Endereco do sistema visto desta maquina (o Nginx)
function UrlBase {
    $porta = LerEnv 'HTTP_PORTA'
    if ($porta -match '^[0-9]+$') { return "http://localhost:$porta" }
    return 'http://localhost'
}

# Codigo HTTP de uma requisicao (0 se nao respondeu). Com corpo, e um POST de JSON.
function CodigoHttp($url, $corpoJson) {
    $parametros = @{ Uri = $url; UseBasicParsing = $true; TimeoutSec = 15; MaximumRedirection = 0 }
    if ($corpoJson) { $parametros.Method = 'Post'; $parametros.Body = [System.Text.Encoding]::UTF8.GetBytes($corpoJson); $parametros.ContentType = 'application/json' }
    try {
        return [int](Invoke-WebRequest @parametros).StatusCode
    } catch {
        $resposta = $_.Exception.Response
        if ($resposta) { return [int]$resposta.StatusCode }
        return 0
    }
}

# Uma consulta no banco central, so o valor (sem cabecalho). Devolve $null se der erro.
# ($null na entrada: sem isso, o "docker compose exec" pode ficar esperando o que se digita no terminal.)
function Consultar($sql) {
    $ErrorActionPreference = 'Continue'
    $saida = $null | & docker compose exec -T db psql -U postgres -d medicalfield -v ON_ERROR_STOP=1 -At -c $sql 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return (($saida | ForEach-Object { "$_" }) -join "`n").Trim()
}

function BancoNoAr {
    $ErrorActionPreference = 'Continue'
    $estado = & docker inspect --format '{{.State.Status}}' medicalfield-db 2>$null
    return ("$estado".Trim() -eq 'running')
}

# Constroi as imagens uma de cada vez: compilar as quatro juntas pode passar da memoria disponivel
function ConstruirImagens {
    $i = 0
    foreach ($servico in $SERVICOS_COM_BUILD) {
        $i++
        Titulo "Construindo $servico ($i/$($SERVICOS_COM_BUILD.Count))"
        PorBaixo "docker compose build $servico"
        RodarDocker compose build $servico
    }
}

# Pouca memoria para o Docker Desktop compilar? (Maven e o build do portal sao os que mais pedem)
function AvisarMemoriaParaBuild {
    $ErrorActionPreference = 'Continue'
    $bytes = & docker info --format '{{.MemTotal}}' 2>$null
    $mb = 0
    if ([int64]::TryParse("$bytes".Trim(), [ref]$null)) { $mb = [int]([int64]"$bytes".Trim() / 1MB) }
    if ($mb -gt 0 -and $mb -lt 3000) {
        Aviso "O Docker Desktop tem so $mb MB de memoria. Se o build parar com `"killed`", aumente em Settings > Resources e rode de novo."
    }
}

# Chaves RSA dos tokens (D-06), em infra\secrets (fora do Git). Gerar de novo invalida os tokens ja emitidos.
function GerarChavesJwt {
    & (Join-Path $PSScriptRoot 'gerar-chaves-jwt.ps1')
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

# O psql como postgres enxerga as tabelas dos quatro schemas sem o prefixo (\dt lista tudo; SELECT * FROM pessoa)
function MostrarSchemasNoPsql {
    $null = Consultar 'ALTER ROLE postgres IN DATABASE medicalfield SET search_path = clinico, auth, documentos, auditoria, public'
}

# Dados de demonstracao (docs/11, secao 11.2): contas com a DEMO_SENHA, medicamentos, pessoas e atendimentos.
# Pode rodar de novo: nao duplica, e regrava a senha das contas (tambem desbloqueia e reativa).
# O PowerShell nao tem o "<" do bash: os arquivos vao primeiro para dentro do container do banco.
function CarregarDemo {
    $senha = LerEnv 'DEMO_SENHA'
    if (-not $senha -or $senha.StartsWith('troque-esta-senha')) { Erro 'defina a DEMO_SENHA no infra\.env.' }
    $psql = @('compose', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'medicalfield', '-v', 'ON_ERROR_STOP=1', '-q', '-o', '/dev/null')
    PorBaixo 'docker compose cp seed/01-profissionais.sql db:/tmp/01-profissionais.sql'
    ComposeQuieto cp seed/01-profissionais.sql db:/tmp/01-profissionais.sql
    PorBaixo 'docker compose exec -T db psql -U postgres -d medicalfield -v senha=... -f /tmp/01-profissionais.sql'
    RodarDocker @psql -v "senha=$senha" -f /tmp/01-profissionais.sql
    if ((Consultar "SELECT to_regclass('clinico.pessoa') IS NOT NULL") -ne 't') {
        Erro 'o ms-clinico ainda nao criou as tabelas dele (veja: docker compose logs ms-clinico).'
    }
    PorBaixo 'docker compose cp seed/02-clinico.sql db:/tmp/02-clinico.sql'
    ComposeQuieto cp seed/02-clinico.sql db:/tmp/02-clinico.sql
    PorBaixo 'docker compose exec -T db psql -U postgres -d medicalfield -f /tmp/02-clinico.sql'
    RodarDocker @psql -f /tmp/02-clinico.sql
    MostrarSchemasNoPsql
}

function TextoDe($seguro) {
    $ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro) }
}
