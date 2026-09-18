Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backupScript = Join-Path $repo 'scripts\backup-edge.ps1'
$restoreScript = Join-Path $repo 'scripts\restaurar-edge.ps1'
$scheduleScript = Join-Path $repo 'scripts\configurar-backup-edge.ps1'

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

Write-Host '[1/7] Validando herramientas de backup local...'
Assert (Test-Path -LiteralPath $backupScript) 'Falta scripts/backup-edge.ps1.'
Assert (Test-Path -LiteralPath $restoreScript) 'Falta scripts/restaurar-edge.ps1.'
Assert (Test-Path -LiteralPath $scheduleScript) 'Falta scripts/configurar-backup-edge.ps1.'
Assert (Test-Path -LiteralPath (Join-Path $repo 'deploy\node\.env')) 'Falta deploy/node/.env.'

Write-Host '[2/7] Generando backup real de PostgreSQL + archivos locales...'
$output = & $backupScript -Retention 14 2>&1
$output | ForEach-Object { Write-Host $_ }
$pathLine = $output | Where-Object { $_ -is [string] -and $_ -like 'BACKUP_PATH=*' } | Select-Object -Last 1
Assert ([bool]$pathLine) 'El script de backup no reporto BACKUP_PATH.'
$backupPath = ([string]$pathLine).Substring('BACKUP_PATH='.Length)
Assert (Test-Path -LiteralPath $backupPath) 'El archivo ZIP de backup no existe.'
Assert (Test-Path -LiteralPath ($backupPath + '.sha256')) 'Falta el SHA256 externo del backup.'

Write-Host '[3/7] Verificando SHA256 del contenedor de backup...'
$expectedLine = (Get-Content -LiteralPath ($backupPath + '.sha256') | Select-Object -First 1)
$expectedHash = (($expectedLine -split '\s+')[0]).ToLowerInvariant()
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash.ToLowerInvariant()
Assert ($expectedHash -eq $actualHash) 'El SHA256 externo del backup no coincide.'

$inspectTemp = Join-Path ([IO.Path]::GetTempPath()) ('sigr-cert-meta-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $inspectTemp | Out-Null
try {
  Expand-Archive -LiteralPath $backupPath -DestinationPath $inspectTemp -Force
  $meta = Get-Content -LiteralPath (Join-Path $inspectTemp 'metadata.json') -Raw | ConvertFrom-Json
  Assert ([int]$meta.tableCount -gt 0) 'El backup reporta 0 tablas; se rechaza antes de intentar restaurar.'
  Assert ([int]$meta.migrationCount -gt 0) 'El backup reporta 0 migraciones; se rechaza antes de intentar restaurar.'
  Write-Host ("Fuente certificada: tablas={0}, migraciones={1}, db={2}" -f $meta.tableCount, $meta.migrationCount, $meta.postgresDb)
} finally {
  if (Test-Path -LiteralPath $inspectTemp) { Remove-Item -LiteralPath $inspectTemp -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host '[4/7] Restaurando el backup en una base temporal aislada...'
$restoreOutput = @(& $restoreScript -BackupPath $backupPath -Modo Verificar 2>&1)
$restoreOutput | ForEach-Object { Write-Host $_ }
$restoreMarker = $restoreOutput | Where-Object { ([string]$_) -like 'RESTORE_CERTIFIED|*' } | Select-Object -Last 1
Assert ([bool]$restoreMarker) 'La restauracion temporal termino sin marcador estructurado de certificacion.'
$restoreMarkerText = [string]$restoreMarker
$expectedRestoreMarker = "RESTORE_CERTIFIED|tables=$($meta.tableCount)|migrations=$($meta.migrationCount)|production=false"
Assert ($restoreMarkerText -eq $expectedRestoreMarker) ("Marcador de restauracion inesperado. Recibido='{0}' Esperado='{1}'" -f $restoreMarkerText, $expectedRestoreMarker)

Write-Host '[5/7] Comprobando que produccion sigue saludable despues de la prueba...'
$ready = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8080/api/health/ready' -TimeoutSec 10
Assert ($ready.StatusCode -eq 200) 'Backend local no responde 200 despues de verificar la restauracion.'
$front = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8080/node-health' -TimeoutSec 10
Assert ($front.StatusCode -eq 200) 'Frontend local no responde 200 despues de verificar la restauracion.'

Write-Host '[6/7] Configurando backup automatico diario...'
& $scheduleScript -Hora '23:30' -Retention 14 | Out-Host
$task = Get-ScheduledTask -TaskName 'SIGR Backup Local Diario' -ErrorAction SilentlyContinue
Assert ([bool]$task) 'No se encontro la tarea programada SIGR Backup Local Diario.'

Write-Host '[7/7] Validando que el backup no contiene deploy/node/.env ni secretos conocidos...'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('sigr-cert-backup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $temp | Out-Null
try {
  Expand-Archive -LiteralPath $backupPath -DestinationPath $temp -Force
  Assert (-not (Test-Path -LiteralPath (Join-Path $temp 'deploy\node\.env'))) 'El backup contiene deploy/node/.env, lo cual no esta permitido.'
  $metadata = Get-Content -LiteralPath (Join-Path $temp 'metadata.json') -Raw
  Assert ($metadata -notmatch 'JWT_SECRET') 'metadata.json contiene JWT_SECRET.'
  Assert ($metadata -notmatch 'POSTGRES_PASSWORD') 'metadata.json contiene POSTGRES_PASSWORD.'
  Assert ($metadata -notmatch 'SYNC_PEER_KEY') 'metadata.json contiene SYNC_PEER_KEY.'
} finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}

Write-Host ''
Write-Host 'SIGR SPRINT 50B BACKUP Y RESTAURACION OK' -ForegroundColor Green
Write-Host "Backup certificado : $backupPath"
Write-Host 'Restauracion       : base temporal aislada, produccion intacta'
Write-Host 'Automatico         : diario 23:30, retencion 14 backups'
Write-Host 'Secretos           : excluidos del paquete'
