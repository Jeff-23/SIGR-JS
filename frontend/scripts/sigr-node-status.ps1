Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Falta deploy/node/.env.' }
Push-Location $repo
try {
  docker compose --env-file $envFile -f docker-compose.node.yml ps
} finally { Pop-Location }
