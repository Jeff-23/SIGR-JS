Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-SigrBackendRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Get-SigrRepoRoot {
  return (Resolve-Path (Join-Path (Get-SigrBackendRoot) '..')).Path
}

function Get-SigrPostgresContainer {
  param([string]$PreferredName)
  if ($PreferredName) {
    $running = docker inspect -f '{{.State.Running}}' $PreferredName 2>$null
    if ($LASTEXITCODE -eq 0 -and $running -eq 'true') { return $PreferredName }
    throw "El contenedor PostgreSQL indicado no está disponible: $PreferredName"
  }

  $rows = @(docker ps --format '{{.Names}}|{{.Image}}' 2>$null)
  if ($LASTEXITCODE -ne 0) { throw 'Docker no está disponible. Abre Docker Desktop e inténtalo de nuevo.' }
  $postgres = @($rows | Where-Object { $_ -match '\|postgres(:|$)' })
  if ($postgres.Count -eq 0) { throw 'No se encontró un contenedor PostgreSQL en ejecución.' }
  if ($postgres.Count -gt 1) {
    $names = ($postgres | ForEach-Object { ($_ -split '\|')[0] }) -join ', '
    throw "Hay varios PostgreSQL en ejecución ($names). Usa -DbContainer para indicar cuál corresponde a SIGR."
  }
  return (($postgres[0] -split '\|')[0])
}

function Get-ContainerEnv {
  param([string]$Container,[string]$Name)
  $value = docker exec $Container printenv $Name 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) { throw "No se encontró $Name dentro de $Container." }
  return $value.Trim()
}

function Get-FileSha256Lower {
  param([string]$Path)
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Assert-BackupManifest {
  param([string]$BackupDir)
  $resolved = (Resolve-Path -LiteralPath $BackupDir).Path
  $manifestPath = Join-Path $resolved 'manifest.json'
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Falta manifest.json en $resolved" }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  foreach ($entry in @(
    @{ name='database'; file=$manifest.database.file; hash=$manifest.database.sha256 },
    @{ name='media'; file=$manifest.media.file; hash=$manifest.media.sha256 }
  )) {
    $file = Join-Path $resolved ([string]$entry.file)
    if (-not (Test-Path -LiteralPath $file)) { throw "Falta $($entry.name): $file" }
    $actual = Get-FileSha256Lower $file
    if ($actual -ne ([string]$entry.hash).ToLowerInvariant()) { throw "SHA-256 inválido para $($entry.name). No uses este backup." }
  }
  return @{ dir=$resolved; manifest=$manifest }
}
