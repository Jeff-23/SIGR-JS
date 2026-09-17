Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Falta deploy/node/.env. Ejecuta primero scripts/configurar-node-local.ps1' }
Push-Location $repo
try {
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop no está disponible.' }
  docker compose --env-file $envFile -f docker-compose.node.yml up -d --build
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible iniciar SIGR Local Node.' }
  Write-Host ''
  Write-Host 'SIGR LOCAL NODE INICIADO' -ForegroundColor Green
  Write-Host 'Acceso en este PC: http://localhost:8080'
  Write-Host 'Para otros dispositivos usa: http://IP-DE-ESTE-PC:8080'
} finally { Pop-Location }
