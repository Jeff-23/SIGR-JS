$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$syncFile = Join-Path $root 'deploy\sync\.env.smoke'
$nodeFile = Join-Path $root 'deploy\node\.env'
$cloudFile = Join-Path $root 'deploy\cloud\.env.smoke'

if (-not (Test-Path $syncFile)) { throw 'Falta deploy\sync\.env.smoke. Ejecuta configurar-sync-smoke.ps1.' }
if (-not (Test-Path $nodeFile)) { throw 'Falta deploy\node\.env. 48B debe estar configurado.' }
if (-not (Test-Path $cloudFile)) { throw 'Falta deploy\cloud\.env.smoke. 48C debe estar configurado.' }

$moneyController = Join-Path $root 'backend\src\modulos\sync\sync.controller.ts'
if (-not (Select-String -Path $moneyController -Pattern "certification/money/setup" -Quiet)) {
  throw '48D-2B no esta aplicado en backend/src/modulos/sync/sync.controller.ts.'
}

function Read-EnvFile([string]$path) {
  $map = @{}
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
      $parts = $line.Split('=',2)
      $map[$parts[0].Trim()] = $parts[1].Trim()
    }
  }
  return $map
}

$sync = Read-EnvFile $syncFile
Push-Location $root
try {
  # 1) Cloud: receptor publico. Durante smoke registra automaticamente SOLO el peer de prueba.
  $env:SYNC_ENABLED = 'true'
  $env:SYNC_ROLE = 'CLOUD'
  $env:SYNC_NODE_ID = $sync.CLOUD_NODE_ID
  $env:SYNC_POLL_INTERVAL_MS = '3000'
  $env:SYNC_BATCH_SIZE = '50'
  $env:SYNC_CERTIFICATION_ENABLED = 'true'
  $env:SYNC_CERT_KEY = $sync.SYNC_CERT_KEY
  $env:SYNC_BOOTSTRAP_PEER_NODE_ID = $sync.EDGE_NODE_ID
  $env:SYNC_BOOTSTRAP_PEER_KEY = $sync.SYNC_PEER_KEY
  docker compose --env-file $cloudFile -f docker-compose.cloud.yml -f docker-compose.cloud-smoke.yml build backend migrate
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible reconstruir Cloud 48D-2B.' }
  docker compose --env-file $cloudFile -f docker-compose.cloud.yml -f docker-compose.cloud-smoke.yml up -d --build
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible iniciar Cloud con Sync 48D-2B.' }

  # 2) EDGE: el PC inicia TODAS las conexiones hacia Cloud; no requiere abrir puertos del router.
  Remove-Item Env:SYNC_BOOTSTRAP_PEER_NODE_ID -ErrorAction SilentlyContinue
  Remove-Item Env:SYNC_BOOTSTRAP_PEER_KEY -ErrorAction SilentlyContinue
  $env:SYNC_ROLE = 'EDGE'
  $env:SYNC_NODE_ID = $sync.EDGE_NODE_ID
  $env:SYNC_PEER_URL = 'http://host.docker.internal:8081/api'
  $env:SYNC_PEER_NODE_ID = $sync.CLOUD_NODE_ID
  $env:SYNC_PEER_KEY = $sync.SYNC_PEER_KEY
  docker compose --env-file $nodeFile -f docker-compose.node.yml build backend migrate
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible reconstruir EDGE 48D-2B.' }
  docker compose --env-file $nodeFile -f docker-compose.node.yml up -d --build
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible iniciar EDGE con Sync 48D-2B.' }

  Write-Host ''
  Write-Host 'SIGR SYNC HIBRIDO INICIADO'
  Write-Host 'EDGE : http://localhost:8080'
  Write-Host 'CLOUD: http://localhost:8081'
} finally {
  Pop-Location
}
