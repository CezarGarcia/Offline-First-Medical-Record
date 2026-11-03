@echo off
rem Apaga os dados do app MedicalField NESTE computador: banco local, configuracao, sessao e logs locais.
rem Use depois de zerar o servidor (infra/scripts/zerar.sh), antes de um novo ensaio do roteiro.
rem
rem Uso: clique duas vezes (apaga os perfis "padrao" e "ambulancia-02"),
rem      ou, no Prompt de Comando: apagar-dados-locais.cmd ambulancia-03
setlocal EnableExtensions

set "PASTA=%APPDATA%\MedicalField"
set "PERFIS=%*"
if "%PERFIS%"=="" set "PERFIS=padrao ambulancia-02"

echo.
echo  Apaga os dados do app MedicalField deste computador (perfis: %PERFIS%).
echo  Os registros que ainda nao foram para o servidor (fila de sincronizacao) se perdem.
echo  Na proxima abertura, o app pede o endereco do servidor e o nome do dispositivo,
echo  e o primeiro login precisa ser online.
echo.

tasklist /FI "IMAGENAME eq MedicalField.exe" 2>nul | find /I "MedicalField.exe" >nul
if not errorlevel 1 (
  echo  Feche o MedicalField ^(todas as janelas^) e rode de novo.
  echo.
  pause
  exit /b 1
)

set "CONFIRMA="
set /p "CONFIRMA= Digite APAGAR para continuar: "
if /I not "%CONFIRMA%"=="APAGAR" (
  echo  Nada foi apagado.
  pause
  exit /b 1
)

for %%P in (%PERFIS%) do (
  if exist "%PASTA%\%%P\" (
    rmdir /s /q "%PASTA%\%%P"
    if exist "%PASTA%\%%P\" (
      echo  Nao consegui apagar %PASTA%\%%P ^(algum arquivo aberto?^)
    ) else (
      echo  Apagado: %PASTA%\%%P
    )
  ) else (
    echo  Nao existia: %PASTA%\%%P
  )
)
echo.
echo  Pronto.
pause
