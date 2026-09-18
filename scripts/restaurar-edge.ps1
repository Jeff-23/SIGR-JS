param(
  [string]$BackupPath = '',
  [ValidateSet('Verificar','Produccion')]
  [string]$Modo = 'Verificar',
  [string]$Confirmacion = ''
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
  $lines = Invoke-NativeCapture { docker exec $ContainerId psql -U $User -d $Database -Atc $Sql } 'No fue posible consultar PostgreSQL durante la restauracion.'
  return (($lines -join [Environment]::NewLine).Trim())
}

function Test-PackageIntegrity([string]$ExpandedPath) {
  $manifestPath = Join-Path $ExpandedPath 'manifest.json'
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Backup invalido: falta manifest.json.' }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  foreach ($item in @($manifest.files)) {
    $target = Join-Path $ExpandedPath (($item.path -replace '/', '\'))
    if (-not (Test-Path -LiteralPath $target)) { throw "Backup invalido: falta $($item.path)." }
    $file = Get-Item -LiteralPath $target
    if ([int64]$file.Length -ne [int64]$item.length) { throw "Backup corrupto: longitud distinta en $($item.path)." }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant()
    if ($hash -ne ([string]$item.sha256).ToLowerInvariant()) { throw "Backup corrupto: SHA256 distinto en $($item.path)." }
  }
}

if (-not (Test-Path -LiteralPath $envFile)) { throw 'Falta deploy/node/.env.' }
if (-not $BackupPath) {
  $root = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'SIGR\backups' } else { Join-Path $repo 'backups-local' }
  $latest = @(Get-ChildItem -LiteralPath $root -Filter 'SIGR-edge-backup-*.zip' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
  if ($latest.Count -eq 0) { throw 'No existe un backup SIGR para restaurar/verificar.' }
  $BackupPath = $latest[0].FullName
}
$BackupPath = (Resolve-Path -LiteralPath $BackupPath).Path

if ($Modo -eq 'Produccion' -and $Confirmacion -ne 'RESTAURAR-SIGR') { throw 'La restauracion de produccion requiere -Confirmacion RESTAURAR-SIGR.' }

$temp = Join-Path ([IO.Path]::GetTempPath()) ('sigr-restore-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $temp | Out-Null

Push-Location $repo
try {
  Expand-Archive -LiteralPath $BackupPath -DestinationPath $temp -Force
  Test-PackageIntegrity $temp

  $metadataPath = Join-Path $temp 'metadata.json'
  $dumpPath = Join-Path $temp 'database.dump'
  if (-not (Test-Path -LiteralPath $metadataPath)) { throw 'Backup invalido: falta metadata.json.' }
  if (-not (Test-Path -LiteralPath $dumpPath)) { throw 'Backup invalido: falta database.dump.' }
  $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
  if ([int]$metadata.tableCount -le 0) { throw 'Backup invalido: metadata.tableCount es 0.' }
  if ([int]$metadata.migrationCount -le 0) { throw 'Backup invalido: metadata.migrationCount es 0.' }

  $null = Invoke-NativeCapture { docker info } 'Docker Desktop no esta disponible.' -Quiet
  $postgresPort = Read-EnvValue $envFile 'POSTGRES_PORT'
  if (-not $postgresPort) { $postgresPort = '5433' }
  $dbId = Resolve-DbContainer $envFile $composeFile $postgresPort
  $postgresUser = Get-ContainerEnvValue $dbId 'POSTGRES_USER'
  $activeDb = Get-ContainerEnvValue $dbId 'POSTGRES_DB'
  if (-not $postgresUser) { throw 'El contenedor PostgreSQL no reporta POSTGRES_USER.' }
  if (-not $activeDb) { throw 'El contenedor PostgreSQL no reporta POSTGRES_DB.' }

  $containerDump = '/tmp/sigr-restore.dump'
  $null = Invoke-NativeCapture { docker exec $dbId rm -f $containerDump } 'No fue posible limpiar el dump temporal previo.' -Quiet
  $null = Invoke-NativeCapture { docker cp $dumpPath ("${dbId}:$containerDump") } 'No fue posible copiar el dump al contenedor PostgreSQL.' -Quiet
  $catalog = Invoke-NativeCapture { docker exec $dbId pg_restore -l $containerDump } 'No fue posible inspeccionar el catalogo del dump a restaurar.'
  $dumpEntries = @($catalog | Where-Object { $_ -match '\sTABLE( DATA)?\s' }).Count
  if ($dumpEntries -le 0) { throw 'Backup invalido: el dump no contiene entradas de tablas.' }

  if ($Modo -eq 'Verificar') {
    $restoreDb = 'sigr_restore_cert_' + (Get-Date -Format 'yyyyMMddHHmmss')
    try {
      $null = Invoke-NativeCapture { docker exec $dbId dropdb --if-exists -U $postgresUser $restoreDb } 'No fue posible limpiar la base temporal antes de restaurar.' -Quiet
      $null = Invoke-NativeCapture { docker exec $dbId createdb -U $postgresUser $restoreDb } 'No fue posible crear la base temporal de restauracion.' -Quiet
      $null = Invoke-NativeCapture { docker exec $dbId pg_restore --no-owner --no-privileges -U $postgresUser -d $restoreDb $containerDump } 'pg_restore fallo sobre la base temporal.' -Quiet

      $tableCountText = Invoke-PsqlScalar $dbId $postgresUser $restoreDb "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';"
      $migrationCountText = Invoke-PsqlScalar $dbId $postgresUser $restoreDb 'SELECT count(*) FROM public._prisma_migrations;'
      $tableCount = 0
      $migrationCount = 0
      if (-not [int]::TryParse($tableCountText, [ref]$tableCount)) { throw "Conteo de tablas restauradas invalido: '$tableCountText'." }
      if (-not [int]::TryParse($migrationCountText, [ref]$migrationCount)) { throw "Conteo de migraciones restauradas invalido: '$migrationCountText'." }
      if ($tableCount -le 0) { throw 'Restauracion invalida: la base temporal quedo sin tablas public.' }
      if ($migrationCount -le 0) { throw 'Restauracion invalida: la base temporal quedo sin historial Prisma.' }
      if ($tableCount -ne [int]$metadata.tableCount) { throw "Restauracion incompleta: tablas=$tableCount esperado=$($metadata.tableCount)." }
      if ($migrationCount -ne [int]$metadata.migrationCount) { throw "Restauracion incompleta: migraciones=$migrationCount esperado=$($metadata.migrationCount)." }

      Write-Host ''
      Write-Host 'SIGR RESTORE VERIFICADO OK' -ForegroundColor Green
      Write-Host "Backup      : $BackupPath"
      Write-Host "Tablas      : $tableCount"
      Write-Host "Migraciones : $migrationCount"
      Write-Host 'Produccion  : NO modificada'
      # Write-Host no viaja por el success stream en Windows PowerShell 5.1.
      # Emitimos un marcador estructurado para que el certificador pueda
      # verificar el resultado sin depender de texto de consola.
      Write-Output ("RESTORE_CERTIFIED|tables={0}|migrations={1}|production=false" -f $tableCount, $migrationCount)
    } finally {
      try { $null = Invoke-NativeCapture { docker exec $dbId dropdb --if-exists -U $postgresUser $restoreDb } 'No fue posible limpiar la base temporal de certificacion.' -Quiet } catch { Write-Warning $_.Exception.Message }
      try { $null = Invoke-NativeCapture { docker exec $dbId rm -f $containerDump } 'No fue posible limpiar el dump temporal.' -Quiet } catch { }
    }
    return
  }

  if ([string]$metadata.postgresDb -ne $activeDb) { throw "El backup pertenece a la base '$($metadata.postgresDb)' pero la instalacion activa usa '$activeDb'. Se aborta la restauracion de produccion." }

  Write-Host 'Creando backup de emergencia antes de restaurar produccion...'
  & (Join-Path $repo 'scripts\backup-edge.ps1') -Retention 14 | Out-Host

  $null = Invoke-NativeCapture { docker compose --env-file $envFile -f $composeFile stop frontend backend } 'No fue posible detener frontend/backend.' -Quiet
  try {
    $terminateSql = "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$activeDb' AND pid <> pg_backend_pid();"
    $null = Invoke-PsqlScalar $dbId $postgresUser 'postgres' $terminateSql
    $null = Invoke-NativeCapture { docker exec $dbId dropdb --if-exists -U $postgresUser $activeDb } 'No fue posible eliminar la base de produccion para restaurarla.' -Quiet
    $null = Invoke-NativeCapture { docker exec $dbId createdb -U $postgresUser $activeDb } 'No fue posible recrear la base de produccion.' -Quiet
    $null = Invoke-NativeCapture { docker exec $dbId pg_restore --no-owner --no-privileges -U $postgresUser -d $activeDb $containerDump } 'pg_restore fallo restaurando produccion.' -Quiet
    $null = Invoke-NativeCapture { docker compose --env-file $envFile -f $composeFile run --rm migrate npx prisma migrate deploy } 'Las migraciones posteriores a la restauracion fallaron.' -Quiet

    $storageSource = Join-Path $temp 'storage'
    if (Test-Path -LiteralPath $storageSource) {
      foreach ($name in @('media','soportes')) {
        $source = Join-Path $storageSource $name
        if (Test-Path -LiteralPath $source) {
          $dest = Join-Path $repo ('backend\storage\' + $name)
          New-Item -ItemType Directory -Force -Path $dest | Out-Null
          Get-ChildItem -LiteralPath $source -Force -ErrorAction SilentlyContinue | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $dest -Recurse -Force }
        }
      }
    }
  } finally {
    try { $null = Invoke-NativeCapture { docker exec $dbId rm -f $containerDump } 'No fue posible limpiar el dump temporal.' -Quiet } catch { }
    $null = Invoke-NativeCapture { docker compose --env-file $envFile -f $composeFile up -d backend frontend } 'No fue posible reiniciar frontend/backend.' -Quiet
  }

  Write-Host ''
  Write-Host 'SIGR RESTAURACION PRODUCCION COMPLETADA' -ForegroundColor Green
  Write-Host "Backup: $BackupPath"
  Write-Host 'Se creo un backup de emergencia antes de modificar la base.'
} finally {
  Pop-Location
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}
