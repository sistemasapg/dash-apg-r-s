@echo off
REM Puxa a Gupy e grava a foto do dia. Chamado pelo Agendador de Tarefas.
REM Roda a partir da pasta do projeto, entao pode ser agendado de qualquer lugar.

cd /d "%~dp0"

if not exist "data" mkdir "data"

echo. >> "data\sync.log"
echo ===== %DATE% %TIME% ===== >> "data\sync.log"

node scripts\sync.mts >> "data\sync.log" 2>&1

if errorlevel 1 (
  echo FALHOU - veja data\sync.log >> "data\sync.log"
  exit /b 1
)

exit /b 0
