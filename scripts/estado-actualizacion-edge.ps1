Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$root = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'SIGR\updates' } else { Join-Path $repo 'updates-local' }

Write-Host 'SIGR EDGE - ESTADO DE ACTUALIZACIONES'
Write-Host "Directorio : $root"

if (-not (Test-Path -LiteralPath $root)) {
  Write-Host 'Sin historial de actualizaciones.'
  exit 0
}

$latest = @(Get-ChildItem -LiteralPath $root -Filter 'update-*.json' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
if ($latest.Count -eq 0) {
  Write-Host 'Sin historial de actualizaciones.'
  exit 0
}

$data = Get-Content -LiteralPath $latest[0].FullName -Raw | ConvertFrom-Json
Write-Host "Archivo     : $($latest[0].FullName)"
Write-Host "Estado      : $($data.status)"
Write-Host "Nodo        : $($data.nodeId)"
Write-Host "Commit      : $($data.commit)"
Write-Host "Inicio      : $($data.startedAt)"
if ($data.completedAt) { Write-Host "Fin         : $($data.completedAt)" }
if ($data.backupPath) { Write-Host "Backup      : $($data.backupPath)" }
$hasBefore = $data.PSObject.Properties.Name -contains 'migrationsBefore'
$hasAfter = $data.PSObject.Properties.Name -contains 'migrationsAfter'
if ($hasBefore -and $hasAfter) {
  Write-Host "Migraciones : $($data.migrationsBefore) -> $($data.migrationsAfter)"
} elseif ($hasBefore) {
  Write-Host "Migraciones : $($data.migrationsBefore) -> no registrado"
}
$hasTablesBefore = $data.PSObject.Properties.Name -contains 'tablesBefore'
$hasTablesAfter = $data.PSObject.Properties.Name -contains 'tablesAfter'
if ($hasTablesBefore -and $hasTablesAfter) {
  Write-Host "Tablas      : $($data.tablesBefore) -> $($data.tablesAfter)"
}
if ($data.rollback) { Write-Host "Rollback    : $($data.rollback)" }
if ($data.error) { Write-Host "Ultimo error: $($data.error)" }
