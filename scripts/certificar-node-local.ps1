Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Falta deploy/node/.env.' }

function Read-EnvValue([string]$Path, [string]$Name, [string]$Default) {
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
  if (-not $line) { return $Default }
  $value = (($line -split '=', 2)[1]).Trim()
  if (-not $value) { return $Default }
  return $value
}

$port = Read-EnvValue $envFile 'NODE_HTTP_PORT' '8080'
$base = "http://127.0.0.1:$port"
Push-Location $repo
try {
  $ps = docker compose --env-file $envFile -f docker-compose.node.yml ps --format json | Out-String
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Docker Compose.' }
  if ($ps -notmatch 'frontend' -or $ps -notmatch 'backend' -or $ps -notmatch 'db') { throw 'Faltan servicios del nodo.' }

  Write-Host '[1/4] Frontend/Nginx...'
  $nodeHealth = Invoke-WebRequest -UseBasicParsing -Uri "$base/node-health" -TimeoutSec 10
  if ($nodeHealth.StatusCode -ne 200 -or $nodeHealth.Content.Trim() -ne 'ok') { throw 'Frontend/Nginx no está saludable.' }

  Write-Host '[2/4] Backend + PostgreSQL a través del proxy...'
  $ready = Invoke-RestMethod -Uri "$base/api/health/ready" -TimeoutSec 10
  if ($ready.status -ne 'ok' -or $ready.database -ne 'available') { throw 'Backend o PostgreSQL no están listos.' }

  Write-Host '[3/4] Aplicación React...'
  $homeResponse = Invoke-WebRequest -UseBasicParsing -Uri $base -TimeoutSec 10
  if ($homeResponse.StatusCode -ne 200 -or $homeResponse.Content -notmatch '<div id="root"') { throw 'El frontend React no está disponible.' }

  Write-Host '[4/4] Persistencia media...'
  if (-not (Test-Path -LiteralPath (Join-Path $repo 'backend\storage\media'))) { throw 'No existe backend/storage/media.' }

  Write-Host ''
  Write-Host 'SIGR LOCAL NODE OK' -ForegroundColor Green
  Write-Host "URL local: $base"
  Write-Host 'DB, backend, frontend y media están disponibles.'
} finally { Pop-Location }
