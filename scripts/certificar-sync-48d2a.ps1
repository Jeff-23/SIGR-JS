$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$syncFile = Join-Path $root 'deploy\sync\.env.smoke'
if (-not (Test-Path $syncFile)) { throw 'Falta deploy\sync\.env.smoke.' }

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
function Post-Json([string]$url, [hashtable]$headers, $body) {
  return Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 30 -Compress) -TimeoutSec 20
}
function Get-Json([string]$url, [hashtable]$headers) {
  return Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 20
}
function Wait-Healthy([string]$container, [int]$seconds = 40) {
  $limit = (Get-Date).AddSeconds($seconds)
  do {
    $state = docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $container 2>$null
    if ($LASTEXITCODE -eq 0 -and ($state -eq 'healthy' -or $state -eq 'running')) { return }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $limit)
  throw "El contenedor $container no quedo saludable."
}

$cfg = Read-EnvFile $syncFile
$headers = @{ 'x-sigr-cert-key' = $cfg.SYNC_CERT_KEY }
$edge = 'http://localhost:8080/api'
$cloud = 'http://localhost:8081/api'
$cloudBackend = 'sigr-cloud-smoke-backend-1'

$ids = @{
  restauranteGlobalId = [guid]::NewGuid().ToString()
  sucursalGlobalId = [guid]::NewGuid().ToString()
  categoriaGlobalId = [guid]::NewGuid().ToString()
  productoGlobalId = [guid]::NewGuid().ToString()
  estacionGlobalId = [guid]::NewGuid().ToString()
}

Write-Host '[1/8] Preparando referencias iguales en EDGE y CLOUD...'
$null = Post-Json "$edge/sync/internal/certification/business/setup" $headers $ids
$null = Post-Json "$cloud/sync/internal/certification/business/setup" $headers $ids

Write-Host '[2/8] Simulando Cloud fuera de linea...'
docker stop $cloudBackend | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No fue posible detener temporalmente el backend Cloud.' }

Write-Host '[3/8] Creando Pedido + Detalle + Domicilio + Comanda en EDGE sin Cloud...'
$flow = Post-Json "$edge/sync/internal/certification/business/create-edge-flow" $headers $ids
Start-Sleep -Milliseconds 1200
$pending = Get-Json "$edge/sync/internal/certification/status" $headers
if ([int]$pending.outboxPendiente -lt 3) { throw 'EDGE no conservo los eventos reales pendientes durante la caida.' }

Write-Host '[4/8] Recuperando Cloud y sincronizando EDGE -> CLOUD...'
docker start $cloudBackend | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No fue posible iniciar nuevamente el backend Cloud.' }
Wait-Healthy $cloudBackend
Start-Sleep -Seconds 2
1..3 | ForEach-Object {
  $null = Post-Json "$edge/sync/internal/certification/cycle" $headers @{}
  Start-Sleep -Milliseconds 900
}

Write-Host '[5/8] Verificando operacion real en CLOUD...'
$query = "pedidoGlobalId=$($flow.pedidoGlobalId)&comandaGlobalId=$($flow.comandaGlobalId)&domicilioGlobalId=$($flow.domicilioGlobalId)"
$cloudState = Get-Json "$cloud/sync/internal/certification/business/status?$query" $headers
if (-not $cloudState.pedido) { throw 'Cloud no recibio Pedido.' }
if ([int]$cloudState.pedido.detalles -ne 1) { throw 'Cloud duplico o perdio DetallePedido.' }
if (-not $cloudState.comanda -or [int]$cloudState.comanda.detalles -ne 1) { throw 'Cloud no reconstruyo Comanda/DetalleComanda.' }
if (-not $cloudState.domicilio) { throw 'Cloud no recibio Domicilio.' }

Write-Host '[6/8] Generando cambios reales CLOUD -> EDGE...'
$null = Post-Json "$cloud/sync/internal/certification/business/update-cloud" $headers @{
  comandaGlobalId = $flow.comandaGlobalId
  domicilioGlobalId = $flow.domicilioGlobalId
}

Write-Host '[7/8] EDGE hace pull + ACK de los cambios Cloud...'
1..3 | ForEach-Object {
  $null = Post-Json "$edge/sync/internal/certification/cycle" $headers @{}
  Start-Sleep -Milliseconds 900
}

Write-Host '[8/8] Verificando convergencia e idempotencia...'
$edgeState = Get-Json "$edge/sync/internal/certification/business/status?$query" $headers
$cloudFinal = Get-Json "$cloud/sync/internal/certification/business/status?$query" $headers
if ($edgeState.pedido.estado -ne 'EN_PREPARACION') { throw "Pedido EDGE no convergio: $($edgeState.pedido.estado)" }
if ($edgeState.comanda.estado -ne 'EN_PREPARACION') { throw "Comanda EDGE no convergio: $($edgeState.comanda.estado)" }
if ($edgeState.comanda.detalleEstado -ne 'EN_PREPARACION') { throw 'DetalleComanda EDGE no convergio.' }
if ($edgeState.domicilio.estado -ne 'CANCELADO') { throw "Domicilio EDGE no convergio: $($edgeState.domicilio.estado)" }
if ([int]$edgeState.pedido.detalles -ne 1 -or [int]$edgeState.comanda.detalles -ne 1) { throw 'Se detectaron duplicados en EDGE.' }
if ([int]$cloudFinal.pedido.detalles -ne 1 -or [int]$cloudFinal.comanda.detalles -ne 1) { throw 'Se detectaron duplicados en CLOUD.' }

# Un ciclo extra debe ser inocuo.
$null = Post-Json "$edge/sync/internal/certification/cycle" $headers @{}
$edgeFinal = Get-Json "$edge/sync/internal/certification/business/status?$query" $headers
if ([int]$edgeFinal.pedido.detalles -ne 1 -or [int]$edgeFinal.comanda.detalles -ne 1) { throw 'La repeticion del ciclo produjo duplicados.' }

Write-Host ''
Write-Host 'SIGR SYNC 48D-2A OK'
Write-Host "Pedido    : $($flow.pedidoGlobalId)"
Write-Host "Comanda   : $($flow.comandaGlobalId)"
Write-Host "Domicilio : $($flow.domicilioGlobalId)"
Write-Host 'Caida Cloud, cola offline, recuperacion, EDGE->CLOUD, CLOUD->EDGE e idempotencia certificadas.'
