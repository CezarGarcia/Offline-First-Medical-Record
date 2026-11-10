# Confere se o sistema esta pronto para a apresentacao (a versao Windows do verificar.sh): containers, rotas
# pelo Nginx, login das contas de demonstracao, dados, e-mail e maquina. Nao muda nada.
#
# Uso, no PowerShell, da pasta do repositorio (com o Docker Desktop aberto):
#   powershell -ExecutionPolicy Bypass -File infra\scripts\verificar.ps1

. (Join-Path $PSScriptRoot '_comum.ps1')
ExigirDocker
ExigirEnv

$script:problemas = 0
$script:avisos = 0
function Problema($texto) { Falha $texto; $script:problemas++ }
function Atencao($texto) { Aviso $texto; $script:avisos++ }
$URL = UrlBase

Titulo 'Containers'
foreach ($servico in @('db', 'ms-auth', 'ms-clinico', 'ms-docs', 'nginx')) {
    $ErrorActionPreference = 'Continue'
    $estado = & docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "medicalfield-$servico" 2>$null
    if ($LASTEXITCODE -ne 0) { $estado = 'ausente' }
    $ErrorActionPreference = 'Stop'
    switch ("$estado".Trim()) {
        'running healthy' { Ok "${servico}: no ar" }
        'running starting' { Atencao "${servico}: subindo (espere uns segundos e rode de novo)" }
        'running' { Ok "${servico}: no ar" }
        default { Problema "${servico}: $("$estado".Trim()) (logs: docker compose logs $servico)" }
    }
}

Titulo "Rotas pelo Nginx ($URL)"
if ((CodigoHttp "$URL/") -eq 200) { Ok 'portal: a tela de login abre' } else { Problema "portal: $URL/ nao respondeu 200" }
foreach ($par in @(@('/api/auth/me', 'ms-auth'), @('/api/pessoa', 'ms-clinico'), @('/api/documentos/email', 'ms-docs'))) {
    $codigo = CodigoHttp "$URL$($par[0])"
    if ($codigo -eq 401) { Ok "$($par[1]): responde (401 sem token, como deve ser)" }
    else { Problema "$($par[1]): $($par[0]) respondeu $codigo (esperado: 401)" }
}

Titulo 'Contas de demonstracao'
$senha = LerEnv 'DEMO_SENHA'
if (-not $senha -or $senha -eq 'troque-esta-senha-de-demo') {
    Problema 'DEMO_SENHA nao esta definida no infra\.env'
} else {
    foreach ($conta in @(@('10001-RS', 'admin (Dr. Ricardo)'), @('12345-RS', 'operacional (Dra. Ana)'))) {
        $quem = $conta[1]
        $corpo = @{ tipoRegistro = 'CRM'; registro = $conta[0]; senha = $senha } | ConvertTo-Json -Compress
        $codigo = CodigoHttp "$URL/api/auth/login" $corpo
        if ($codigo -eq 200) { Ok "login do $quem" }
        elseif ($codigo -eq 401) {
            # Nao tenta a outra conta: cada senha errada conta para o bloqueio (5 seguidas = 5 minutos)
            Problema "login do $quem recusado: a DEMO_SENHA do .env nao e a gravada no banco. Rode o instalar.ps1 para gravar a do .env"
            break
        }
        elseif ($codigo -eq 403) { Problema "login do ${quem}: conta desativada. O instalar.ps1 reativa as contas de demonstracao" }
        elseif ($codigo -eq 423) { Problema "login do ${quem}: conta bloqueada por senhas erradas. O instalar.ps1 desbloqueia (ou espere 5 minutos)" }
        else { Problema "login do $quem respondeu $codigo (o ms-auth esta no ar?)" }
    }
}

Titulo 'Dados'
if (BancoNoAr) {
    $contagem = Consultar ("SELECT (SELECT count(*) FROM auth.profissional) || ' ' || (SELECT count(*) FROM clinico.medicamento) " +
        "|| ' ' || (SELECT count(*) FROM clinico.pessoa) || ' ' || (SELECT count(*) FROM clinico.prontuario) " +
        "|| ' ' || (SELECT count(*) FROM clinico.atendimento) || ' ' || (SELECT count(*) FROM documentos.envio_email)")
    if ($contagem) {
        $n = "$contagem" -split ' ' | ForEach-Object { [int]$_ }
        $profissionais, $medicamentos, $pessoas, $prontuarios, $atendimentos, $emails = $n
        Ok "$profissionais profissionais, $medicamentos medicamentos, $pessoas pessoas, $prontuarios prontuarios, $atendimentos atendimentos, $emails e-mails enviados"
        if ($profissionais -lt 4) { Problema 'faltam as contas de demonstracao: instalar.ps1' }
        if (-not ($medicamentos -gt 0 -and $pessoas -ge 2 -and $atendimentos -ge 2)) {
            Problema 'faltam os dados clinicos de demonstracao (medicamentos, pessoas, atendimentos): instalar.ps1'
        }
        if ($pessoas -gt 2 -or $atendimentos -gt 2) {
            Atencao 'ha registros alem dos de demonstracao (de ensaios?). O roteiro espera 2 prontuarios e 2 atendimentos nos passos 3 e 4: para recomecar, zerar.ps1'
        }
        if ((Consultar "SELECT count(*) FROM clinico.medicamento WHERE lower(nome) = 'cetoprofeno'") -ne '0') {
            Atencao 'o Cetoprofeno ja esta no banco: o passo 9 do roteiro (inserir o medicamento) nao vai mostrar nada novo'
        }
    } else {
        Problema 'nao consegui ler as tabelas (os servicos ja criaram as tabelas deles?)'
    }
} else {
    Problema 'o banco nao esta no ar'
}

Titulo 'E-mail'
$smtp = LerEnv 'SMTP_HOST'
if (-not $smtp) {
    Atencao 'envio de e-mail desligado (SMTP_HOST vazio no infra\.env): o passo 17 vai falhar. Ver docs/12, secao 12.8'
} elseif ($smtp -eq 'smtp-teste') {
    Atencao 'os e-mails vao para o Mailpit (servidor de teste), nao para uma caixa de verdade: http://localhost:8025'
} else {
    Ok "envio pelo ${smtp}:$(LerEnv 'SMTP_PORTA') (para testar de verdade: mande uma ficha pelo portal)"
}
$estrategia = LerEnv 'ESTRATEGIA_CONFLITO'
if (-not $estrategia) { $estrategia = 'MAIS_RECENTE_VENCE' }
Ok "estrategia de conflitos: $estrategia"

Titulo 'Maquina'
if ((Test-Path (Join-Path $INFRA 'secrets\jwt-privada.pem') -PathType Leaf) -and (Test-Path (Join-Path $INFRA 'secrets\jwt-publica.pem') -PathType Leaf)) {
    Ok 'chaves dos tokens em infra\secrets\'
} else {
    Problema 'faltam as chaves dos tokens: instalar.ps1'
}
# As senhas do banco sao simples e estao no repositorio (D-49): a porta dele nao pode ficar aberta para fora
$ErrorActionPreference = 'Continue'
$portaBanco = (& docker port medicalfield-db 5432/tcp 2>$null | Select-Object -First 1)
$memoria = & docker info --format '{{.MemTotal}}' 2>$null
$ErrorActionPreference = 'Stop'
$portaBanco = "$portaBanco".Trim()
if ($portaBanco.StartsWith('127.0.0.1:')) {
    $quem = if ((LerEnv 'POSTGRES_PASSWORD') -eq 'postgres') { 'usuario postgres, senha postgres' } else { 'usuario postgres, senha do POSTGRES_PASSWORD' }
    Ok "banco em $portaBanco, so para esta maquina ($quem)"
} elseif ($portaBanco) {
    Problema "a porta do banco esta aberta para fora ($portaBanco). Com as senhas do .env.example, ela tem de ficar em 127.0.0.1 (D-49)"
}
if ("$memoria".Trim() -match '^[0-9]+$') { Ok "$([int]([int64]"$memoria".Trim() / 1MB)) MB de memoria para o Docker Desktop" }
$agora = [DateTime]::UtcNow
$brasilia = $null
foreach ($fuso in @('E. South America Standard Time', 'America/Sao_Paulo')) {
    try { $brasilia = [TimeZoneInfo]::ConvertTimeFromUtc($agora, [TimeZoneInfo]::FindSystemTimeZoneById($fuso)); break } catch { }
}
$textoBrasilia = if ($brasilia) { " ($($brasilia.ToString('HH:mm')) em Brasilia)" } else { '' }
Ok "hora: $($agora.ToString('dd/MM/yyyy HH:mm')) UTC$textoBrasilia"

Write-Host ''
if ($script:problemas -eq 0 -and $script:avisos -eq 0) {
    Write-Host 'Tudo pronto.' -ForegroundColor Green
} elseif ($script:problemas -eq 0) {
    Write-Host "Tudo no ar, com $($script:avisos) aviso(s) acima." -ForegroundColor Yellow
} else {
    Write-Host "$($script:problemas) problema(s) acima." -ForegroundColor Red
    exit 1
}

exit 0
