param(
  [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
  [string]$Hora = '23:30',
  [ValidateRange(2, 120)]
  [int]$Retention = 14
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backupScript = Join-Path $repo 'scripts\backup-edge.ps1'
if (-not (Test-Path -LiteralPath $backupScript)) { throw 'Falta scripts/backup-edge.ps1.' }

$taskName = 'SIGR Backup Local Diario'
$userId = if ($env:USERDOMAIN) { $env:USERDOMAIN + '\' + $env:USERNAME } else { $env:USERNAME }
$at = [datetime]::ParseExact($Hora, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)

$arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $backupScript + '" -Retention ' + $Retention
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At $at
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Backup diario local de SIGR. Requiere sesion de Windows iniciada y Docker Desktop disponible.' -Force | Out-Null

$task = Get-ScheduledTask -TaskName $taskName
if (-not $task) { throw 'La tarea programada no pudo verificarse.' }

Write-Host ''
Write-Host 'SIGR BACKUP AUTOMATICO CONFIGURADO' -ForegroundColor Green
Write-Host "Tarea      : $taskName"
Write-Host "Hora       : $Hora"
Write-Host "Retencion  : $Retention backups"
Write-Host 'Ejecucion  : usuario interactivo actual (Docker Desktop debe estar disponible)'
