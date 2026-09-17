param([string]$TaskName = 'SIGR Backup Diario')
$ErrorActionPreference = 'Stop'
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) { Write-Host 'La tarea de backup no está instalada.'; exit 0 }
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Tarea eliminada: $TaskName" -ForegroundColor Green
