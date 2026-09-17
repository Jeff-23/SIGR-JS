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
function Wait-Healthy([string]$container, [int]$seconds = 45) {
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
  usuarioGlobalId = [guid]::NewGuid().ToString()
  metodoEfectivoGlobalId = [guid]::NewGuid().ToString()
  metodoTarjetaGlobalId = [guid]::NewGuid().ToString()
}

Write-Host '[1/9] Preparando referencias monetarias iguales en EDGE y CLOUD...'
$null = Post-Json "$edge/sync/internal/certification/money/setup" $headers $ids
$null = Post-Json "$cloud/sync/internal/certification/money/setup" $headers $ids

Write-Host '[2/9] Simulando Cloud fuera de linea...'
docker stop $cloudBackend | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No fue posible detener temporalmente el backend Cloud.' }

Write-Host '[3/9] Creando Caja + Venta + pago parcial + pago mixto en EDGE sin Cloud...'
$flow = Post-Json "$edge/sync/internal/certification/money/create-edge-flow" $headers $ids
Start-Sleep -Milliseconds 1200
$pending = Get-Json "$edge/sync/internal/certification/status" $headers
if ([int]$pending.outboxPendiente -lt 4) { throw 'EDGE no conservo los eventos monetarios pendientes durante la caida.' }

Write-Host '[4/9] Recuperando Cloud y sincronizando EDGE -> CLOUD...'
docker start $cloudBackend | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No fue posible iniciar nuevamente el backend Cloud.' }
Wait-Healthy $cloudBackend
Start-Sleep -Seconds 2
1..4 | ForEach-Object {
  $null = Post-Json "$edge/sync/internal/certification/cycle" $headers @{}
  Start-Sleep -Milliseconds 800
}

Write-Host '[5/9] Verificando Venta + dos Pagos + Caja en CLOUD...'
$query = "ventaGlobalId=$($flow.ventaGlobalId)&cajaGlobalId=$($flow.cajaGlobalId)"
$cloudState = Get-Json "$cloud/sync/internal/certification/money/status?$query" $headers
if (-not $cloudState.venta) { throw 'Cloud no recibio Venta.' }
if ($cloudState.venta.estado -ne 'PAGADA') { throw "Venta Cloud no quedo PAGADA: $($cloudState.venta.estado)" }
if ([int]$cloudState.venta.detalles -ne 1) { throw 'Cloud duplico o perdio DetalleVenta.' }
if (@($cloudState.venta.pagos).Count -ne 2) { throw 'Cloud no tiene exactamente dos pagos.' }
if ([decimal]$cloudState.venta.totalPagado -ne 100000) { throw "Total pagado Cloud incorrecto: $($cloudState.venta.totalPagado)" }
$tipos = @($cloudState.venta.pagos | ForEach-Object { $_.tipo })
if ($tipos -notcontains 'EFECTIVO' -or $tipos -notcontains 'TARJETA') { throw 'No se conservaron los dos metodos de pago del pago mixto.' }
if (-not $cloudState.caja -or $cloudState.caja.estado -ne 'ABIERTA') { throw 'Cloud no reconstruyo la Caja abierta.' }

Write-Host '[6/9] Reencolando los mismos agregados para probar no duplicacion...'
$null = Post-Json "$edge/sync/internal/certification/money/requeue" $headers @{ ventaGlobalId = $flow.ventaGlobalId; cajaGlobalId = $flow.cajaGlobalId }
1..3 | ForEach-Object {
  $null = Post-Json "$edge/sync/internal/certification/cycle" $headers @{}
  Start-Sleep -Milliseconds 700
}
$cloudRepeat = Get-Json "$cloud/sync/internal/certification/money/status?$query" $headers
if (@($cloudRepeat.venta.pagos).Count -ne 2) { throw 'Reenvio monetario produjo pagos duplicados.' }
if ([decimal]$cloudRepeat.venta.totalPagado -ne 100000) { throw 'Reenvio altero el total pagado.' }

Write-Host '[7/9] Generando MovimientoCaja real CLOUD -> EDGE...'
$cloudChange = Post-Json "$cloud/sync/internal/certification/money/update-cloud" $headers @{ cajaGlobalId = $flow.cajaGlobalId; usuarioGlobalId = $ids.usuarioGlobalId }
if ([int]$cloudChange.eventosMovimiento -lt 1) { throw 'Cloud creo MovimientoCaja pero no genero evento Outbox hacia EDGE.' }
$outboxMov = @($cloudChange.outboxMovimiento)
if ($outboxMov.Count -lt 1) { throw 'Cloud reporto evento de MovimientoCaja pero no devolvio metadata Outbox.' }
$badDest = @($outboxMov | Where-Object { $_.nodoDestinoId -ne $cfg.EDGE_NODE_ID })
if ($badDest.Count -gt 0) { throw "Outbox Cloud apunta a nodo incorrecto. Esperado=$($cfg.EDGE_NODE_ID) destinos=$((@($outboxMov | ForEach-Object { $_.nodoDestinoId }) -join ','))" }
$badSource = @($outboxMov | Where-Object { $_.nodoOrigenId -ne $cfg.CLOUD_NODE_ID })
if ($badSource.Count -gt 0) { throw "Outbox Cloud tiene origen incorrecto. Esperado=$($cfg.CLOUD_NODE_ID) origenes=$((@($outboxMov | ForEach-Object { $_.nodoOrigenId }) -join ','))" }

Write-Host '[8/9] EDGE hace pull + ACK del movimiento Cloud...'
$deadline = (Get-Date).AddSeconds(45)
$lastCycle = $null
$edgeState = $null
$cloudFinal = $null
do {
  $lastCycle = Post-Json "$edge/sync/internal/certification/cycle" $headers @{}
  Start-Sleep -Milliseconds 750
  $edgeState = Get-Json "$edge/sync/internal/certification/money/status?$query" $headers
  $cloudFinal = Get-Json "$cloud/sync/internal/certification/money/status?$query" $headers
  $edgeMov = @($edgeState.caja.movimientos | Where-Object { $_.globalId -eq $cloudChange.movimientoCajaGlobalId })
  $cloudMov = @($cloudFinal.caja.movimientos | Where-Object { $_.globalId -eq $cloudChange.movimientoCajaGlobalId })
  if ($edgeMov.Count -eq 1 -and $cloudMov.Count -eq 1) { break }
} while ((Get-Date) -lt $deadline)

Write-Host '[9/9] Verificando convergencia financiera e idempotencia final...'
if (@($edgeState.venta.pagos).Count -ne 2 -or @($cloudFinal.venta.pagos).Count -ne 2) { throw 'Cantidad de pagos divergente.' }
if ([decimal]$edgeState.venta.totalPagado -ne 100000 -or [decimal]$cloudFinal.venta.totalPagado -ne 100000) { throw 'Total pagado no converge.' }
$edgeMov = @($edgeState.caja.movimientos | Where-Object { $_.globalId -eq $cloudChange.movimientoCajaGlobalId })
$cloudMov = @($cloudFinal.caja.movimientos | Where-Object { $_.globalId -eq $cloudChange.movimientoCajaGlobalId })
if ($edgeMov.Count -ne 1 -or $cloudMov.Count -ne 1) {
  $edgeStatus = Get-Json "$edge/sync/internal/certification/status" $headers
  $cloudStatus = Get-Json "$cloud/sync/internal/certification/status" $headers
  $detalleApply = ''
  if ($lastCycle.applyErrorDetails) {
    $detalleApply = (@($lastCycle.applyErrorDetails | ForEach-Object { $_.eventType + ':' + $_.status + ':' + $_.error }) -join ' | ')
  }
  throw "MovimientoCaja Cloud->EDGE no convergio. EDGE=$($edgeMov.Count) CLOUD=$($cloudMov.Count) eventosMovimiento=$($cloudChange.eventosMovimiento) eventosCaja=$($cloudChange.eventosCaja) ciclo(push=$($lastCycle.push),pull=$($lastCycle.pull),ack=$($lastCycle.ack),fetched=$($lastCycle.fetched),sourceMismatch=$($lastCycle.sourceMismatch),applyErrors=$($lastCycle.applyErrors),busy=$($lastCycle.busy)) errores=[$detalleApply] outboxMov=$((@($outboxMov | ForEach-Object { $_.eventId + '/' + $_.nodoOrigenId + '->' + $_.nodoDestinoId + '/' + $_.estado }) -join ',')) outboxEDGE=$($edgeStatus.outboxPendiente) outboxCLOUD=$($cloudStatus.outboxPendiente) inboxErrorEDGE=$($edgeStatus.inboxError)."
}

# Ciclo extra inocuo para demostrar idempotencia final.
$null = Post-Json "$edge/sync/internal/certification/cycle" $headers @{}
Start-Sleep -Milliseconds 500
$edgeFinal = Get-Json "$edge/sync/internal/certification/money/status?$query" $headers
if (@($edgeFinal.venta.pagos).Count -ne 2) { throw 'Ciclo extra produjo pagos duplicados.' }
if (@($edgeFinal.caja.movimientos | Where-Object { $_.globalId -eq $cloudChange.movimientoCajaGlobalId }).Count -ne 1) { throw 'Ciclo extra duplico MovimientoCaja.' }

Write-Host ''
Write-Host 'SIGR SYNC 48D-2B OK'
Write-Host "Venta : $($flow.ventaGlobalId)"
Write-Host "Caja  : $($flow.cajaGlobalId)"
Write-Host "Pagos : $($flow.pagoGlobalIds -join ', ')"
Write-Host "Movimiento Cloud -> EDGE: $($cloudChange.movimientoCajaGlobalId)"
Write-Host 'Venta, pago parcial, pago mixto, caja, reenvio idempotente y movimiento bidireccional certificados.'
