$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'deploy\cloud\.env.smoke'
Push-Location $root
try {
  docker compose --env-file $envFile -f docker-compose.cloud.yml -f docker-compose.cloud-smoke.yml down
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible detener SIGR Cloud Smoke.' }
} finally { Pop-Location }
