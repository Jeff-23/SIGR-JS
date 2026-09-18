[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'

function Read-Env([string]$Name) {
  if (-not (Test-Path -LiteralPath $envFile)) { return $null }
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

Write-Host 'SIGR EDGE - DIAGNOSTICO LOCAL' -ForegroundColor Cyan
Write-Host "Repositorio : $repo"
Write-Host "Config      : $envFile"
Write-Host "Existe      : $(Test-Path -LiteralPath $envFile)"
if (-not (Test-Path -LiteralPath $envFile)) { exit 2 }

$httpPort = Read-Env 'NODE_HTTP_PORT'
$nodeId = Read-Env 'SYNC_NODE_ID'
$syncEnabled = Read-Env 'SYNC_ENABLED'
$syncRole = Read-Env 'SYNC_ROLE'
Write-Host "Nodo        : $nodeId"
Write-Host "Rol sync    : $syncRole"
Write-Host "Sync activo : $syncEnabled"
Write-Host "Puerto web  : $httpPort"

$dbPass = Read-Env 'POSTGRES_PASSWORD'
if ([string]::IsNullOrWhiteSpace($dbPass)) {
  Write-Host 'Password DB : AUSENTE' -ForegroundColor Red
} elseif ($dbPass.Length -lt 24) {
  Write-Host 'Password DB : HEREDADO / PENDIENTE DE ROTACION SEGURA' -ForegroundColor Yellow
} else {
  Write-Host 'Password DB : longitud adecuada'
}
Write-Host ''

Push-Location $repo
try {
  docker info *> $null
  Write-Host "Docker      : $(if ($LASTEXITCODE -eq 0) { 'OK' } else { 'NO DISPONIBLE' })"
  if ($LASTEXITCODE -eq 0) {
    docker compose --env-file $envFile -f docker-compose.node.yml ps
  }
} finally { Pop-Location }

foreach ($url in @("http://localhost:$httpPort/node-health", "http://localhost:$httpPort/api/health/ready")) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5
    Write-Host "$url -> HTTP $($r.StatusCode)"
  } catch {
    Write-Host "$url -> ERROR: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host 'No se muestran JWT_SECRET, POSTGRES_PASSWORD, SYNC_PEER_KEY ni otras credenciales.'
