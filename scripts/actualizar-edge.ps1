param(
  [switch]$SinBackup,
  [switch]$SimularFalloPostDeploy
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
$composeFile = Join-Path $repo 'docker-compose.node.yml'
$backupScript = Join-Path $repo 'scripts\backup-edge.ps1'
$stateRoot = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'SIGR\updates' } else { Join-Path $repo 'updates-local' }

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Invoke-NativeCapture([scriptblock]$Command, [string]$ErrorMessage, [switch]$Quiet) {
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& $Command 2>&1)
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($code -ne 0) {
    $detail = (($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine).Trim()
    if ($detail) { throw "$ErrorMessage Exit=$code. $detail" }
    throw "$ErrorMessage Exit=$code."
  }
  if ($Quiet) { return @() }
  return @($output | ForEach-Object { [string]$_ })
}

function Read-EnvValue([string]$Path, [string]$Name) {
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

function Get-ServiceContainer([string]$Service, [switch]$All) {
  if ($All) {
    $lines = Invoke-NativeCapture { docker compose --env-file $envFile -f $composeFile ps -a -q $Service } "No fue posible localizar el servicio $Service."
  } else {
    $lines = Invoke-NativeCapture { docker compose --env-file $envFile -f $composeFile ps -q $Service } "No fue posible localizar el servicio $Service."
  }
  return ($lines | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^[0-9a-fA-F]{12,64}$' } | Select-Object -First 1)
}

function Get-ContainerImage([string]$ContainerId) {
  if (-not $ContainerId) { return $null }
  $lines = Invoke-NativeCapture { docker inspect --format '{{.Image}}' $ContainerId } 'No fue posible consultar la imagen del contenedor.'
  return (($lines | Select-Object -First 1).Trim())
}

function Get-DbCounts {
  $dbId = Get-ServiceContainer 'db'
  Assert ([bool]$dbId) 'No se encontro el contenedor PostgreSQL.'
  $envLines = Invoke-NativeCapture { docker inspect $dbId --format '{{range .Config.Env}}{{println .}}{{end}}' } 'No fue posible leer variables del contenedor PostgreSQL.'
  $userLine = $envLines | Where-Object { $_ -like 'POSTGRES_USER=*' } | Select-Object -First 1
  $dbLine = $envLines | Where-Object { $_ -like 'POSTGRES_DB=*' } | Select-Object -First 1
  Assert ([bool]$userLine) 'POSTGRES_USER no disponible en el contenedor.'
  Assert ([bool]$dbLine) 'POSTGRES_DB no disponible en el contenedor.'
  $dbUser = $userLine.Substring('POSTGRES_USER='.Length)
  $dbName = $dbLine.Substring('POSTGRES_DB='.Length)
  $tablesLines = Invoke-NativeCapture { docker exec $dbId psql -U $dbUser -d $dbName -Atc "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';" } 'No fue posible contar tablas.'
  $migrationsLines = Invoke-NativeCapture { docker exec $dbId psql -U $dbUser -d $dbName -Atc 'SELECT count(*) FROM public._prisma_migrations;' } 'No fue posible contar migraciones.'
  $tables = 0
  $migrations = 0
  Assert ([int]::TryParse((($tablesLines -join '').Trim()), [ref]$tables)) 'Conteo de tablas invalido.'
  Assert ([int]::TryParse((($migrationsLines -join '').Trim()), [ref]$migrations)) 'Conteo de migraciones invalido.'
  return [pscustomobject]@{ Tables = $tables; Migrations = $migrations; Database = $dbName }
}

function Wait-Http200([string]$Url, [int]$Attempts = 30) {
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($response.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Test-DeployTreeClean {
  $lines = Invoke-NativeCapture { git status --porcelain -- backend frontend docker-compose.node.yml deploy/node } 'No fue posible validar el estado Git del despliegue.'
  $dirty = @($lines | Where-Object { $_ -and $_.Trim() })
  if ($dirty.Count -gt 0) {
    throw ('Hay cambios sin commit en archivos de despliegue. No se actualizara el nodo automaticamente:' + [Environment]::NewLine + (($dirty | ForEach-Object { '  ' + $_ }) -join [Environment]::NewLine))
  }
}

function Tag-RollbackImage([string]$ImageId, [string]$Repository, [string]$Tag) {
  if (-not $ImageId) { return $null }
  $name = $Repository + ':' + $Tag
  $null = Invoke-NativeCapture { docker tag $ImageId $name } "No fue posible preservar la imagen $Repository para rollback." -Quiet
  return $name
}

function Restore-CodeImages([string]$BackendImage, [string]$FrontendImage, [string]$MigrateImage) {
  if ($BackendImage) { $null = Invoke-NativeCapture { docker tag $BackendImage 'sigr-js-backend:latest' } 'No fue posible restaurar imagen backend.' -Quiet }
  if ($FrontendImage) { $null = Invoke-NativeCapture { docker tag $FrontendImage 'sigr-js-frontend:latest' } 'No fue posible restaurar imagen frontend.' -Quiet }
  if ($MigrateImage) { $null = Invoke-NativeCapture { docker tag $MigrateImage 'sigr-js-migrate:latest' } 'No fue posible restaurar imagen migrate.' -Quiet }
  $null = Invoke-NativeCapture { docker compose --env-file $envFile -f $composeFile up -d --no-build --force-recreate } 'No fue posible recrear el stack con las imagenes de rollback.' -Quiet
  Assert (Wait-Http200 'http://localhost:8080/api/health/ready') 'Backend no recupero salud despues del rollback de codigo.'
  Assert (Wait-Http200 'http://localhost:8080/node-health') 'Frontend no recupero salud despues del rollback de codigo.'
}

Assert (Test-Path -LiteralPath $envFile) 'Falta deploy/node/.env.'
Assert (Test-Path -LiteralPath $composeFile) 'Falta docker-compose.node.yml.'
Assert (Test-Path -LiteralPath $backupScript) 'Falta scripts/backup-edge.ps1. 50B debe estar instalado antes de 50C.'
New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null

Push-Location $repo
try {
  Write-Host '[1/8] Validando nodo, Docker y arbol de despliegue...'
  $null = Invoke-NativeCapture { docker info } 'Docker Desktop no esta disponible.' -Quiet
  Test-DeployTreeClean
  Assert (Wait-Http200 'http://localhost:8080/api/health/ready' 5) 'Backend local no esta saludable antes de actualizar.'
  Assert (Wait-Http200 'http://localhost:8080/node-health' 5) 'Frontend local no esta saludable antes de actualizar.'

  $gitLines = Invoke-NativeCapture { git rev-parse HEAD } 'No fue posible determinar el commit actual.'
  $commit = ($gitLines | Select-Object -First 1).Trim()
  $branchLines = Invoke-NativeCapture { git rev-parse --abbrev-ref HEAD } 'No fue posible determinar la rama actual.'
  $branch = ($branchLines | Select-Object -First 1).Trim()
  $nodeId = Read-EnvValue $envFile 'SYNC_NODE_ID'
  if (-not $nodeId) { $nodeId = 'edge-local' }

  Write-Host '[2/8] Generando backup obligatorio pre-actualizacion...'
  $backupPath = $null
  if (-not $SinBackup) {
    $backupOutput = @(& $backupScript -Retention 14 2>&1)
    $backupOutput | ForEach-Object { Write-Host $_ }
    $pathLine = $backupOutput | Where-Object { ([string]$_) -like 'BACKUP_PATH=*' } | Select-Object -Last 1
    Assert ([bool]$pathLine) 'El backup previo no reporto BACKUP_PATH.'
    $backupPath = ([string]$pathLine).Substring('BACKUP_PATH='.Length)
    Assert (Test-Path -LiteralPath $backupPath) 'El backup previo no existe.'
  } else {
    Write-Host 'ADVERTENCIA: backup previo omitido por parametro explicito -SinBackup.' -ForegroundColor Yellow
  }

  Write-Host '[3/8] Capturando imagenes y estado de base antes del despliegue...'
  $countsBefore = Get-DbCounts
  Assert ($countsBefore.Tables -gt 0) 'La base activa no contiene tablas.'
  Assert ($countsBefore.Migrations -gt 0) 'La base activa no contiene migraciones Prisma.'
  $backendContainer = Get-ServiceContainer 'backend'
  $frontendContainer = Get-ServiceContainer 'frontend'
  $migrateContainer = Get-ServiceContainer 'migrate' -All
  Assert ([bool]$backendContainer) 'No se encontro backend activo.'
  Assert ([bool]$frontendContainer) 'No se encontro frontend activo.'
  $oldBackendImage = Get-ContainerImage $backendContainer
  $oldFrontendImage = Get-ContainerImage $frontendContainer
  $oldMigrateImage = Get-ContainerImage $migrateContainer
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $rollbackTag = 'rollback-' + $stamp
  $null = Tag-RollbackImage $oldBackendImage 'sigr-js-backend' $rollbackTag
  $null = Tag-RollbackImage $oldFrontendImage 'sigr-js-frontend' $rollbackTag
  if ($oldMigrateImage) { $null = Tag-RollbackImage $oldMigrateImage 'sigr-js-migrate' $rollbackTag }

  $statePath = Join-Path $stateRoot ('update-' + $stamp + '.json')
  $state = [ordered]@{
    formatVersion = 1
    startedAt = (Get-Date).ToString('o')
    nodeId = $nodeId
    branch = $branch
    commit = $commit
    backupPath = $backupPath
    database = $countsBefore.Database
    tablesBefore = $countsBefore.Tables
    migrationsBefore = $countsBefore.Migrations
    backendImageBefore = $oldBackendImage
    frontendImageBefore = $oldFrontendImage
    migrateImageBefore = $oldMigrateImage
    status = 'STARTED'
  }
  $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding UTF8

  try {
    Write-Host '[4/8] Reconstruyendo y desplegando el commit actual...'
    $buildOutput = Invoke-NativeCapture { docker compose --env-file $envFile -f $composeFile up -d --build } 'La reconstruccion/despliegue Docker fallo.'
    $buildOutput | ForEach-Object { Write-Host $_ }

    Write-Host '[5/8] Validando migraciones y salud posterior...'
    $migrateAfter = Get-ServiceContainer 'migrate' -All
    Assert ([bool]$migrateAfter) 'No se encontro el contenedor migrate despues del despliegue.'
    $exitLines = Invoke-NativeCapture { docker inspect --format '{{.State.ExitCode}}' $migrateAfter } 'No fue posible consultar el resultado de migrate.'
    $migrateExit = (($exitLines | Select-Object -First 1).Trim())
    Assert ($migrateExit -eq '0') "El contenedor migrate termino con ExitCode=$migrateExit."
    Assert (Wait-Http200 'http://localhost:8080/api/health/ready') 'Backend no recupero salud despues del despliegue.'
    Assert (Wait-Http200 'http://localhost:8080/node-health') 'Frontend no recupero salud despues del despliegue.'

    $countsAfter = Get-DbCounts
    Assert ($countsAfter.Tables -gt 0) 'La base perdio sus tablas despues del despliegue.'
    Assert ($countsAfter.Migrations -ge $countsBefore.Migrations) 'El conteo de migraciones disminuyo despues del despliegue.'

    if ($SimularFalloPostDeploy) {
      throw 'FALLO_SIMULADO_50C_POST_DEPLOY'
    }

    Write-Host '[6/8] Registrando actualizacion saludable...'
    $state.status = 'SUCCESS'
    $state.completedAt = (Get-Date).ToString('o')
    $state.tablesAfter = $countsAfter.Tables
    $state.migrationsAfter = $countsAfter.Migrations
    $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding UTF8

    Write-Host '[7/8] Verificando continuidad local...'
    Assert (Wait-Http200 'http://localhost:8080/api/health/ready' 3) 'Backend perdio salud en validacion final.'
    Assert (Wait-Http200 'http://localhost:8080/node-health' 3) 'Frontend perdio salud en validacion final.'

    Write-Host '[8/8] Actualizacion finalizada...'
    Write-Host ''
    Write-Host 'SIGR EDGE ACTUALIZACION OK' -ForegroundColor Green
    Write-Host "Nodo       : $nodeId"
    Write-Host "Commit     : $commit"
    Write-Host "Migraciones: $($countsBefore.Migrations) -> $($countsAfter.Migrations)"
    if ($backupPath) { Write-Host "Backup     : $backupPath" }
    Write-Host "Estado     : $statePath"
    Write-Output "UPDATE_STATE=$statePath"
  } catch {
    $failure = $_.Exception.Message
    $countsFailure = $null
    try { $countsFailure = Get-DbCounts } catch { }
    $migrationsChanged = $false
    if ($countsFailure) { $migrationsChanged = ($countsFailure.Migrations -ne $countsBefore.Migrations) }

    if (-not $migrationsChanged) {
      Write-Host 'Fallo detectado sin cambio de migraciones. Ejecutando rollback automatico de codigo...' -ForegroundColor Yellow
      Restore-CodeImages $oldBackendImage $oldFrontendImage $oldMigrateImage
      $state.status = 'ROLLED_BACK'
      $state.completedAt = (Get-Date).ToString('o')
      $state.error = $failure
      $state.rollback = 'CODE_IMAGES'
      if ($countsFailure) {
        $state.tablesAfter = $countsFailure.Tables
        $state.migrationsAfter = $countsFailure.Migrations
      } else {
        $state.tablesAfter = $countsBefore.Tables
        $state.migrationsAfter = $countsBefore.Migrations
      }
      $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding UTF8
      Write-Host 'SIGR EDGE ROLLBACK CODIGO OK' -ForegroundColor Green
      Write-Output "UPDATE_ROLLBACK_OK=$statePath"
      if ($SimularFalloPostDeploy -and $failure -eq 'FALLO_SIMULADO_50C_POST_DEPLOY') { return }
      throw "Actualizacion fallida; rollback de codigo completado. Causa: $failure"
    }

    $state.status = 'RECOVERY_REQUIRED'
    $state.completedAt = (Get-Date).ToString('o')
    $state.error = $failure
    $state.rollback = 'DATABASE_RESTORE_REQUIRED'
    if ($countsFailure) {
      $state.tablesAfter = $countsFailure.Tables
      $state.migrationsAfter = $countsFailure.Migrations
    }
    $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding UTF8
    throw "Actualizacion fallida despues de aplicar migraciones. No se hace rollback automatico de base. Usa el backup certificado '$backupPath' y scripts/restaurar-edge.ps1 de forma controlada. Causa: $failure"
  }
} finally {
  Pop-Location
}
