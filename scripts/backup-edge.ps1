param(
  [string]$BackupRoot = '',
  [ValidateRange(2, 120)]
  [int]$Retention = 14
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
$composeFile = Join-Path $repo 'docker-compose.node.yml'

function Read-EnvValue([string]$Path, [string]$Name) {
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

function Invoke-NativeCapture([scriptblock]$Command, [string]$ErrorMessage, [switch]$Quiet) {
  $previous = $ErrorActionPreference
  try {
    # Windows PowerShell 5.1 transforma stderr de procesos nativos en ErrorRecord
    # cuando ErrorActionPreference=Stop. Se captura todo y se decide por exit code.
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

function Resolve-DbContainer([string]$EnvFile, [string]$ComposeFile, [string]$HostPort) {
  $composeLines = Invoke-NativeCapture { docker compose --env-file $EnvFile -f $ComposeFile ps -q db } 'No fue posible consultar docker compose.'
  $candidate = $composeLines | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^[0-9a-fA-F]{12,64}$' } | Select-Object -First 1
  if ($candidate) { return $candidate }

  $fallback = Invoke-NativeCapture { docker ps -q --filter 'label=com.docker.compose.service=db' --filter ("publish=$HostPort") } 'No fue posible localizar PostgreSQL por Docker.'
  $ids = @($fallback | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^[0-9a-fA-F]{12,64}$' })
  if ($ids.Count -eq 1) { return $ids[0] }
  if ($ids.Count -eq 0) { throw "No se encontro el contenedor PostgreSQL de SIGR en el puerto host $HostPort." }
  throw "Se encontraron varios contenedores PostgreSQL candidatos en el puerto host $HostPort; no se seleccionara uno automaticamente."
}

function Get-ContainerEnvValue([string]$ContainerId, [string]$Name) {
  $lines = Invoke-NativeCapture { docker inspect $ContainerId --format '{{range .Config.Env}}{{println .}}{{end}}' } 'No fue posible leer la configuracion del contenedor PostgreSQL.'
  $prefix = $Name + '='
  $line = $lines | Where-Object { $_ -like ($prefix + '*') } | Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Substring($prefix.Length)
}

function Invoke-PsqlScalar([string]$ContainerId, [string]$User, [string]$Database, [string]$Sql) {
  $lines = Invoke-NativeCapture { docker exec $ContainerId psql -U $User -d $Database -Atc $Sql } 'No fue posible consultar PostgreSQL.'
  return (($lines -join [Environment]::NewLine).Trim())
}

if (-not (Test-Path -LiteralPath $envFile)) { throw 'Falta deploy/node/.env. Ejecuta primero la instalacion EDGE local.' }
if (-not (Test-Path -LiteralPath $composeFile)) { throw 'Falta docker-compose.node.yml.' }

if (-not $BackupRoot) {
  if ($env:LOCALAPPDATA) { $BackupRoot = Join-Path $env:LOCALAPPDATA 'SIGR\backups' }
  else { $BackupRoot = Join-Path $repo 'backups-local' }
}

$nodeId = Read-EnvValue $envFile 'SYNC_NODE_ID'
if (-not $nodeId) { $nodeId = 'edge-local' }
$syncRole = Read-EnvValue $envFile 'SYNC_ROLE'
$syncEnabled = Read-EnvValue $envFile 'SYNC_ENABLED'
$postgresPort = Read-EnvValue $envFile 'POSTGRES_PORT'
$httpPort = Read-EnvValue $envFile 'NODE_HTTP_PORT'
$timeZone = Read-EnvValue $envFile 'TIME_ZONE'
if (-not $postgresPort) { $postgresPort = '5433' }

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

Push-Location $repo
try {
  $null = Invoke-NativeCapture { docker info } 'Docker Desktop no esta disponible.' -Quiet
  $dbId = Resolve-DbContainer $envFile $composeFile $postgresPort

  $healthLines = Invoke-NativeCapture { docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $dbId } 'No fue posible consultar el estado de PostgreSQL.'
  $health = (($healthLines -join '').Trim())
  if ($health -ne 'healthy' -and $health -ne 'running') { throw "PostgreSQL no esta saludable. Estado=$health" }

  # Fuente de verdad: el contenedor activo. Evita depender de quoting sh -lc y de .env heredados.
  $postgresDb = Get-ContainerEnvValue $dbId 'POSTGRES_DB'
  $postgresUser = Get-ContainerEnvValue $dbId 'POSTGRES_USER'
  if (-not $postgresDb) { throw 'El contenedor PostgreSQL no reporta POSTGRES_DB.' }
  if (-not $postgresUser) { throw 'El contenedor PostgreSQL no reporta POSTGRES_USER.' }

  $tableCountText = Invoke-PsqlScalar $dbId $postgresUser $postgresDb "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';"
  $migrationCountText = Invoke-PsqlScalar $dbId $postgresUser $postgresDb 'SELECT count(*) FROM public._prisma_migrations;'
  $tableCount = 0
  $migrationCount = 0
  if (-not [int]::TryParse($tableCountText, [ref]$tableCount)) { throw "Conteo de tablas invalido: '$tableCountText'." }
  if (-not [int]::TryParse($migrationCountText, [ref]$migrationCount)) { throw "Conteo de migraciones invalido: '$migrationCountText'." }
  if ($tableCount -le 0) { throw "La base activa '$postgresDb' no contiene tablas public. Se aborta para no crear un backup vacio." }
  if ($migrationCount -le 0) { throw "La base activa '$postgresDb' no contiene historial Prisma. Se aborta para no certificar un backup incorrecto." }

  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $temp = Join-Path $BackupRoot ('.tmp-' + $timestamp + '-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $temp | Out-Null

  try {
    $dumpPath = Join-Path $temp 'database.dump'
    $containerDump = '/tmp/sigr-edge-backup.dump'

    $null = Invoke-NativeCapture { docker exec $dbId rm -f $containerDump } 'No fue posible limpiar el dump temporal previo.' -Quiet
    $null = Invoke-NativeCapture { docker exec $dbId pg_dump -Fc --no-owner --no-privileges -U $postgresUser -d $postgresDb -f $containerDump } 'pg_dump fallo. No se genero backup.' -Quiet
    $null = Invoke-NativeCapture { docker cp ("${dbId}:$containerDump") $dumpPath } 'No fue posible copiar el dump PostgreSQL al host.' -Quiet

    $catalog = Invoke-NativeCapture { docker exec $dbId pg_restore -l $containerDump } 'No fue posible inspeccionar el catalogo del dump.'
    $dumpEntries = @($catalog | Where-Object { $_ -match '\sTABLE( DATA)?\s' }).Count
    if ($dumpEntries -le 0) { throw 'El dump generado no contiene entradas de tablas. Se aborta antes de empaquetar.' }
    $null = Invoke-NativeCapture { docker exec $dbId rm -f $containerDump } 'No fue posible limpiar el dump temporal.' -Quiet

    $storageRoot = Join-Path $temp 'storage'
    $mediaSource = Join-Path $repo 'backend\storage\media'
    $supportsSource = Join-Path $repo 'backend\storage\soportes'
    if (Test-Path -LiteralPath $mediaSource) {
      $mediaDest = Join-Path $storageRoot 'media'
      New-Item -ItemType Directory -Force -Path $mediaDest | Out-Null
      Get-ChildItem -LiteralPath $mediaSource -Force -ErrorAction SilentlyContinue | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $mediaDest -Recurse -Force }
    }
    if (Test-Path -LiteralPath $supportsSource) {
      $supportsDest = Join-Path $storageRoot 'soportes'
      New-Item -ItemType Directory -Force -Path $supportsDest | Out-Null
      Get-ChildItem -LiteralPath $supportsSource -Force -ErrorAction SilentlyContinue | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $supportsDest -Recurse -Force }
    }

    $gitCommit = $null
    try {
      $gitLines = Invoke-NativeCapture { git rev-parse HEAD } 'No fue posible leer git HEAD.'
      $gitCommit = ($gitLines | Select-Object -First 1).Trim()
    } catch { $gitCommit = $null }

    $metadata = [ordered]@{
      formatVersion = 2
      createdAt = (Get-Date).ToString('o')
      nodeId = $nodeId
      syncRole = $syncRole
      syncEnabled = $syncEnabled
      postgresUser = $postgresUser
      postgresDb = $postgresDb
      postgresPort = $postgresPort
      httpPort = $httpPort
      timeZone = $timeZone
      tableCount = [int]$tableCount
      migrationCount = [int]$migrationCount
      dumpTableEntries = [int]$dumpEntries
      gitCommit = $gitCommit
      containsSecrets = $false
      note = 'deploy/node/.env y sus secretos NO forman parte de este backup.'
    }
    $metadata | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $temp 'metadata.json') -Encoding UTF8

    $files = @(Get-ChildItem -LiteralPath $temp -Recurse -File | Where-Object { $_.Name -ne 'manifest.json' })
    $manifestItems = @()
    foreach ($file in $files) {
      $relative = $file.FullName.Substring($temp.Length).TrimStart('\','/') -replace '\\','/'
      $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant()
      $manifestItems += [ordered]@{ path = $relative; sha256 = $hash; length = $file.Length }
    }
    [ordered]@{ formatVersion = 2; files = $manifestItems } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $temp 'manifest.json') -Encoding UTF8

    $zipName = 'SIGR-edge-backup-' + $timestamp + '.zip'
    $zipPath = Join-Path $BackupRoot $zipName
    Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $zipPath -CompressionLevel Optimal -Force

    $zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
    ($zipHash + '  ' + $zipName) | Set-Content -LiteralPath ($zipPath + '.sha256') -Encoding ASCII

    $allBackups = @(Get-ChildItem -LiteralPath $BackupRoot -Filter 'SIGR-edge-backup-*.zip' -File | Sort-Object LastWriteTime -Descending)
    if ($allBackups.Count -gt $Retention) {
      $allBackups | Select-Object -Skip $Retention | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force
        Remove-Item -LiteralPath ($_.FullName + '.sha256') -Force -ErrorAction SilentlyContinue
      }
    }

    Write-Host ''
    Write-Host 'SIGR BACKUP EDGE OK' -ForegroundColor Green
    Write-Host "Nodo       : $nodeId"
    Write-Host "Base       : $postgresDb"
    Write-Host "Tablas     : $tableCount"
    Write-Host "Migraciones: $migrationCount"
    Write-Host "Backup     : $zipPath"
    Write-Host "Retencion  : $Retention backups"
    Write-Host 'Secretos   : NO incluidos'
    Write-Output "BACKUP_PATH=$zipPath"
  } finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
  }
} finally {
  Pop-Location
}
