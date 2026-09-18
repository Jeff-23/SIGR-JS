[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
$securityDir = Join-Path $env:LOCALAPPDATA 'SIGR\security'

function Read-EnvValue([string]$Name) {
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

if (-not (Test-Path -LiteralPath $envFile)) { throw 'Falta deploy/node/.env.' }
$jwt = Read-EnvValue 'JWT_SECRET'
$dbPass = Read-EnvValue 'POSTGRES_PASSWORD'
$acl = Get-Acl -LiteralPath $envFile
$latest = $null
if (Test-Path -LiteralPath $securityDir) {
  $latest = @(Get-ChildItem -LiteralPath $securityDir -Filter 'security-*.json' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
}

Write-Host 'SIGR EDGE - ESTADO DE SEGURIDAD LOCAL' -ForegroundColor Cyan
Write-Host "Nodo              : $(Read-EnvValue 'SYNC_NODE_ID')"
Write-Host "Rol               : $(Read-EnvValue 'SYNC_ROLE')"
Write-Host "Sync activo       : $(Read-EnvValue 'SYNC_ENABLED')"
Write-Host "Metricas          : $(Read-EnvValue 'METRICS_ENABLED')"
Write-Host "Password DB       : $(if ($dbPass.Length -ge 32) { 'FUERTE' } else { 'DEBIL / ROTAR' }) (valor oculto)"
Write-Host "JWT               : $(if ($jwt.Length -ge 48) { 'FUERTE' } else { 'DEBIL / ROTAR' }) (valor oculto)"
Write-Host "ACL .env protegida: $($acl.AreAccessRulesProtected)"
if ($latest -and $latest.Count -gt 0) {
  $data = Get-Content -LiteralPath $latest[0].FullName -Raw | ConvertFrom-Json
  Write-Host "Ultimo estado     : $($data.status)"
  Write-Host "Archivo           : $($latest[0].FullName)"
}
