Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Falta deploy/node/.env.' }
Push-Location $repo
try {
  docker compose --env-file $envFile -f docker-compose.node.yml stop
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible detener SIGR Local Node.' }
  Write-Host 'SIGR LOCAL NODE DETENIDO. Los datos persistentes no fueron eliminados.' -ForegroundColor Yellow
} finally { Pop-Location }
