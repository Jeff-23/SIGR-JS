Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$dir = Join-Path $env:LOCALAPPDATA 'SIGR\production-readiness'
if (-not (Test-Path -LiteralPath $dir)) {
  throw 'No existe historial de certificacion integral 50F.'
}
$latest = @(Get-ChildItem -LiteralPath $dir -Filter 'production-ready-*.json' -File | Sort-Object LastWriteTime -Descending)[0]
if ($null -eq $latest) { throw 'No existe estado 50F.' }
$data = Get-Content -LiteralPath $latest.FullName -Raw | ConvertFrom-Json

Write-Host 'SIGR EDGE - ESTADO DE PRODUCCION LOCAL'
Write-Host "Estado      : $($data.status)"
Write-Host "Nodo        : $($data.node)"
Write-Host "Commit      : $($data.commit)"
Write-Host "Certificado : $($data.certifiedAt)"
Write-Host "Modo        : $($data.syncRole) / Sync=$($data.syncEnabled)"
Write-Host "DB          : $($data.db)"
Write-Host "Backend     : $($data.backend)"
Write-Host "Frontend    : $($data.frontend)"
Write-Host "node-health : HTTP $($data.nodeHealth)"
Write-Host "ready       : HTTP $($data.ready)"
Write-Host "Seguridad   : $($data.security)"
Write-Host "Continuidad : $($data.continuity)"
Write-Host "Backup      : $($data.latestBackup)"
Write-Host "Archivo     : $($latest.FullName)"
