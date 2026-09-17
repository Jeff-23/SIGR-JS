$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'deploy\cloud\.env.smoke'
if (-not (Test-Path $envFile)) { throw 'Falta deploy\cloud\.env.smoke. Ejecuta primero configurar-cloud-smoke.ps1.' }
Push-Location $root
try {
  docker compose --env-file $envFile -f docker-compose.cloud.yml -f docker-compose.cloud-smoke.yml up -d --build
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible iniciar SIGR Cloud Smoke.' }
  Write-Host ''
  Write-Host 'SIGR CLOUD SMOKE INICIADO'
  Write-Host 'Acceso: http://localhost:8081'
} finally { Pop-Location }
