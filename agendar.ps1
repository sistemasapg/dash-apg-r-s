# Agenda o sync diário da Gupy no Agendador de Tarefas do Windows.
#
#   .\agendar.ps1              -> agenda para as 07:00
#   .\agendar.ps1 -Hora 06:30  -> agenda para outro horário
#   .\agendar.ps1 -Remover     -> remove o agendamento
#
# Não precisa de administrador: a tarefa é criada no seu usuário.

param(
  [string]$Hora = '07:00',
  [switch]$Remover
)

$ErrorActionPreference = 'Stop'
$nome = 'Dash RS APG - Sync Gupy'
$bat = Join-Path $PSScriptRoot 'sync-diario.bat'

if ($Remover) {
  schtasks /Delete /TN $nome /F
  Write-Host "Agendamento removido."
  exit 0
}

if (-not (Test-Path $bat)) {
  throw "Não encontrei sync-diario.bat em $PSScriptRoot"
}

if (-not (Test-Path (Join-Path $PSScriptRoot '.env.local'))) {
  Write-Warning "Não existe .env.local com o GUPY_TOKEN. A tarefa vai ser criada, mas o sync vai falhar até o token existir."
}

schtasks /Create /TN $nome /TR "`"$bat`"" /SC DAILY /ST $Hora /F

Write-Host ""
Write-Host "Agendado: '$nome' roda todo dia às $Hora."
Write-Host "Log de cada execução: $(Join-Path $PSScriptRoot 'data\sync.log')"
Write-Host ""
Write-Host "Testar agora sem esperar o horário:"
Write-Host "  schtasks /Run /TN `"$nome`""
