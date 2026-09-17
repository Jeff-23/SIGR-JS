param(
  [string]$At = '02:00',
  [string]$TaskName = 'SIGR Backup Diario',
  [int]$RetentionDays = 30
)
$ErrorActionPreference = 'Stop'
$backendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$parts = $At -split ':'
if ($parts.Count -ne 2) { throw 'Usa -At HH:mm, por ejemplo 02:00.' }
$time = Get-Date -Hour ([int]$parts[0]) -Minute ([int]$parts[1]) -Second 0
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$backendRoot'; powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-auto.ps1 -RetentionDays $RetentionDays`""
$trigger = New-ScheduledTaskTrigger -Daily -At $time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Backup diario SIGR: PostgreSQL + media + SHA-256 + manifest.' -Force | Out-Null
Write-Host "Tarea instalada: $TaskName a las $At" -ForegroundColor Green
Write-Warning 'Actívala sólo cuando el restaurante piloto empiece a trabajar con datos reales y Docker Desktop esté disponible a esa hora.'
