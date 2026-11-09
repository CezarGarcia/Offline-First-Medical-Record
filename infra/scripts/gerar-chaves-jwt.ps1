# Gera as chaves dos tokens (JWT) no Windows, com o Docker Desktop: nao precisa de openssl nem de Git Bash.
# (No Linux, o instalar.sh ja faz isto.)
#
# Uso, no PowerShell, de dentro da pasta infra:
#   powershell -ExecutionPolicy Bypass -File scripts\gerar-chaves-jwt.ps1
#
# As chaves sao gravadas por um container do Node, e nao pelo PowerShell, de proposito: o PowerShell grava
# arquivos com BOM ou em UTF-16, e o ms-auth, o ms-clinico e o ms-docs nao leem chaves assim.
# Se as duas chaves ja existem, nao faz nada (para gerar de novo, apague as duas da pasta infra\secrets).
# Este arquivo fica so com ASCII: o PowerShell 5 le scripts sem BOM como ANSI e estragaria os acentos.

$ErrorActionPreference = 'Stop'

$pasta = Join-Path (Split-Path -Parent $PSScriptRoot) 'secrets'
$privada = Join-Path $pasta 'jwt-privada.pem'
$publica = Join-Path $pasta 'jwt-publica.pem'

if ((Test-Path $privada -PathType Leaf) -and (Test-Path $publica -PathType Leaf)) {
    Write-Host "Chaves dos tokens: ja existem em $pasta (para gerar de novo, apague as duas)."
    exit 0
}

New-Item -ItemType Directory -Force -Path $pasta | Out-Null
# As duas sao geradas juntas. Se o Docker criou uma PASTA com o nome da chave (acontece quando o
# "docker compose up" roda antes de as chaves existirem), ela sai tambem.
foreach ($arquivo in @($privada, $publica)) {
    if (Test-Path $arquivo) { Remove-Item $arquivo -Recurse -Force }
}

# Sem aspas duplas dentro do JavaScript: o PowerShell 5 as estraga ao passar para o docker
$js = "const c=require('crypto'),fs=require('fs');" +
    "const k=c.generateKeyPairSync('rsa',{modulusLength:2048});" +
    "fs.writeFileSync('/chaves/jwt-privada.pem',k.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o644});" +
    "fs.writeFileSync('/chaves/jwt-publica.pem',k.publicKey.export({type:'spki',format:'pem'}),{mode:0o644});"

docker run --rm -v "${pasta}:/chaves" node:24-slim node -e $js
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Nao foi possivel gerar as chaves. O Docker Desktop esta aberto?'
    exit 1
}
Write-Host "Chaves dos tokens geradas em $pasta"
