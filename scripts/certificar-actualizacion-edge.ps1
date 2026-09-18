Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$updateScript = Join-Path $repo 'scripts\actualizar-edge.ps1'
$stateScript = Join-Path $repo 'scripts\estado-actualizacion-edge.ps1'

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Wait-Http200([string]$Url, [int]$Attempts = 10) {
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($response.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Seconds 2
  }
  return $false
}

Write-Host '[1/6] Validando scripts y salud inicial...'
Assert (Test-Path -LiteralPath $updateScript) 'Falta scripts/actualizar-edge.ps1.'
Assert (Test-Path -LiteralPath $stateScript) 'Falta scripts/estado-actualizacion-edge.ps1.'
Assert (Wait-Http200 'http://localhost:8080/api/health/ready' 3) 'Backend no esta saludable antes de certificar.'
Assert (Wait-Http200 'http://localhost:8080/node-health' 3) 'Frontend no esta saludable antes de certificar.'

Write-Host '[2/6] Certificando despliegue saludable con backup previo obligatorio...'
$successOutput = @(& $updateScript 2>&1)
$successOutput | ForEach-Object { Write-Host $_ }
$successMarker = $successOutput | Where-Object { ([string]$_) -like 'UPDATE_STATE=*' } | Select-Object -Last 1
Assert ([bool]$successMarker) 'La actualizacion saludable no reporto UPDATE_STATE.'
$successStatePath = ([string]$successMarker).Substring('UPDATE_STATE='.Length)
Assert (Test-Path -LiteralPath $successStatePath) 'No existe el estado de actualizacion saludable.'
$successState = Get-Content -LiteralPath $successStatePath -Raw | ConvertFrom-Json
Assert ($successState.status -eq 'SUCCESS') 'El estado de actualizacion saludable no es SUCCESS.'
Assert ([bool]$successState.backupPath) 'La actualizacion no registro backup previo.'
Assert (Test-Path -LiteralPath ([string]$successState.backupPath)) 'El backup previo registrado no existe.'

Write-Host '[3/6] Verificando integridad funcional despues del despliegue...'
Assert (Wait-Http200 'http://localhost:8080/api/health/ready' 5) 'Backend no esta saludable despues de actualizar.'
Assert (Wait-Http200 'http://localhost:8080/node-health' 5) 'Frontend no esta saludable despues de actualizar.'
Assert ([int]$successState.migrationsBefore -le [int]$successState.migrationsAfter) 'El conteo de migraciones disminuyo.'

Write-Host '[4/6] Simulando fallo post-deploy sin cambio de esquema para probar rollback de codigo...'
$rollbackOutput = @(& $updateScript -SimularFalloPostDeploy 2>&1)
$rollbackOutput | ForEach-Object { Write-Host $_ }
$rollbackMarker = $rollbackOutput | Where-Object { ([string]$_) -like 'UPDATE_ROLLBACK_OK=*' } | Select-Object -Last 1
Assert ([bool]$rollbackMarker) 'No se obtuvo marcador de rollback automatico.'
$rollbackStatePath = ([string]$rollbackMarker).Substring('UPDATE_ROLLBACK_OK='.Length)
Assert (Test-Path -LiteralPath $rollbackStatePath) 'No existe el estado del rollback.'
$rollbackState = Get-Content -LiteralPath $rollbackStatePath -Raw | ConvertFrom-Json
Assert ($rollbackState.status -eq 'ROLLED_BACK') 'El estado de rollback no es ROLLED_BACK.'
Assert ($rollbackState.rollback -eq 'CODE_IMAGES') 'El rollback certificado no fue de imagenes de codigo.'

Write-Host '[5/6] Verificando salud posterior al rollback y registro operacional...'
Assert (Wait-Http200 'http://localhost:8080/api/health/ready' 10) 'Backend no quedo saludable despues del rollback.'
Assert (Wait-Http200 'http://localhost:8080/node-health' 10) 'Frontend no quedo saludable despues del rollback.'
# El visor usa Write-Host, que en Windows PowerShell 5.1 no forma parte del
# success stream capturable. Se ejecuta para visualizacion humana, pero la
# certificacion valida directamente la misma fuente JSON que consume el visor.
& $stateScript

$updatesRoot = Split-Path -Parent $rollbackStatePath
$latestStateFile = @(Get-ChildItem -LiteralPath $updatesRoot -Filter 'update-*.json' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
Assert ($latestStateFile.Count -eq 1) 'No se encontro historial de actualizaciones para validar el visor.'
Assert ($latestStateFile[0].FullName -eq $rollbackStatePath) 'El rollback certificado no es el estado mas reciente.'
$latestState = Get-Content -LiteralPath $latestStateFile[0].FullName -Raw | ConvertFrom-Json
Assert ($latestState.status -eq 'ROLLED_BACK') 'El estado mas reciente no es ROLLED_BACK.'
Assert ($latestState.rollback -eq 'CODE_IMAGES') 'El estado mas reciente no registra rollback CODE_IMAGES.'

Write-Host '[6/6] Validando que no se almacenan secretos en el historial...'
$raw = Get-Content -LiteralPath $rollbackStatePath -Raw
Assert ($raw -notmatch 'JWT_SECRET') 'El historial contiene JWT_SECRET.'
Assert ($raw -notmatch 'POSTGRES_PASSWORD') 'El historial contiene POSTGRES_PASSWORD.'
Assert ($raw -notmatch 'SYNC_PEER_KEY') 'El historial contiene SYNC_PEER_KEY.'

Write-Host ''
Write-Host 'SIGR SPRINT 50C ACTUALIZACION LOCAL OK' -ForegroundColor Green
Write-Host 'Backup previo     : certificado'
Write-Host 'Deploy actual     : saludable'
Write-Host 'Rollback de codigo: certificado sin cambio de migraciones'
Write-Host 'Migraciones       : nunca se revierten automaticamente'
Write-Host 'Secretos          : excluidos del historial'
