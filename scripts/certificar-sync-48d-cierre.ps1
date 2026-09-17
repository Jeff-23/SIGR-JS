$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'deploy\sync\.env.smoke'
if (-not (Test-Path $envFile)) { throw 'Falta deploy\sync\.env.smoke.' }

$certKey = $null
$line = Get-Content $envFile | Where-Object { $_ -match '^SYNC_CERT_KEY=' } | Select-Object -First 1
if ($line) { $certKey = ($line -split '=',2)[1].Trim() }
if (-not $certKey) { throw 'No se encontro SYNC_CERT_KEY en deploy\sync\.env.smoke.' }

$headers = @{ 'x-sigr-cert-key' = $certKey }
$edge = 'http://localhost:8080/api'
$cloud = 'http://localhost:8081/api'
$cloudGateway = 'sigr-cloud-smoke-gateway-1'

function PostJson([string]$url, $body) {
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' `
    -Body ($body | ConvertTo-Json -Depth 30 -Compress) -TimeoutSec 25
}
function GetJson([string]$url) {
  Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 25
}
function New-Id { [guid]::NewGuid().ToString() }
function Wait-Cloud([int]$seconds = 45) {
  $limit = (Get-Date).AddSeconds($seconds)
  do {
    try {
      $ready = Invoke-RestMethod -Method Get -Uri "$cloud/health/ready" -TimeoutSec 3
      if ($ready) { return }
    } catch {}
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $limit)
  throw 'Cloud no quedo disponible despues de la recuperacion.'
}
function Count-Where($items, [scriptblock]$predicate) {
  return @($items | Where-Object $predicate).Count
}

# Un solo restaurante/sucursal para demostrar convergencia multidominio real.
$tenant = [ordered]@{
  restauranteGlobalId = New-Id
  sucursalGlobalId = New-Id
}
$base = [ordered]@{
  restauranteGlobalId = $tenant.restauranteGlobalId
  sucursalGlobalId = $tenant.sucursalGlobalId
  categoriaGlobalId = New-Id
  productoGlobalId = New-Id
  estacionGlobalId = New-Id
}
$money = [ordered]@{
  restauranteGlobalId = $tenant.restauranteGlobalId
  sucursalGlobalId = $tenant.sucursalGlobalId
  categoriaGlobalId = $base.categoriaGlobalId
  productoGlobalId = $base.productoGlobalId
  estacionGlobalId = $base.estacionGlobalId
  usuarioGlobalId = New-Id
  metodoEfectivoGlobalId = New-Id
  metodoTarjetaGlobalId = New-Id
}
$inventory = [ordered]@{
  restauranteGlobalId = $tenant.restauranteGlobalId
  sucursalGlobalId = $tenant.sucursalGlobalId
  categoriaGlobalId = $base.categoriaGlobalId
  productoGlobalId = $base.productoGlobalId
  estacionGlobalId = $base.estacionGlobalId
  usuarioGlobalId = New-Id
  articuloGlobalId = New-Id
}
$loyalty = [ordered]@{
  restauranteGlobalId = $tenant.restauranteGlobalId
  sucursalGlobalId = $tenant.sucursalGlobalId
  categoriaGlobalId = $base.categoriaGlobalId
  productoGlobalId = $base.productoGlobalId
  estacionGlobalId = $base.estacionGlobalId
  usuarioGlobalId = New-Id
  clienteGlobalId = New-Id
  nivelGlobalId = New-Id
  cuentaGlobalId = New-Id
  movimientoGlobalId = New-Id
  consentimientoGlobalId = New-Id
}
$masters = [ordered]@{
  restauranteGlobalId = $tenant.restauranteGlobalId
  sucursalGlobalId = $tenant.sucursalGlobalId
  categoriaGlobalId = New-Id
  productoGlobalId = New-Id
  zonaGlobalId = New-Id
  mesaGlobalId = New-Id
}
$security = [ordered]@{
  restauranteGlobalId = $tenant.restauranteGlobalId
  sucursalGlobalId = $tenant.sucursalGlobalId
  usuarioGlobalId = New-Id
}
$config = [ordered]@{
  restauranteGlobalId = $tenant.restauranteGlobalId
  sucursalGlobalId = $tenant.sucursalGlobalId
}

function BusinessStatus([string]$nodeBase, $flow) {
  GetJson "$nodeBase/sync/internal/certification/business/status?pedidoGlobalId=$($flow.pedidoGlobalId)&comandaGlobalId=$($flow.comandaGlobalId)&domicilioGlobalId=$($flow.domicilioGlobalId)"
}
function MoneyStatus([string]$nodeBase, $flow) {
  GetJson "$nodeBase/sync/internal/certification/money/status?ventaGlobalId=$($flow.ventaGlobalId)&cajaGlobalId=$($flow.cajaGlobalId)"
}
function InventoryStatus([string]$nodeBase) {
  GetJson "$nodeBase/sync/internal/certification/inventory/status?articuloGlobalId=$($inventory.articuloGlobalId)&productoGlobalId=$($inventory.productoGlobalId)"
}
function LoyaltyStatus([string]$nodeBase) {
  GetJson "$nodeBase/sync/internal/certification/loyalty/status?clienteGlobalId=$($loyalty.clienteGlobalId)"
}
function MastersStatus([string]$nodeBase) {
  GetJson "$nodeBase/sync/internal/certification/masters/status?restauranteGlobalId=$($masters.restauranteGlobalId)&sucursalGlobalId=$($masters.sucursalGlobalId)&categoriaGlobalId=$($masters.categoriaGlobalId)&productoGlobalId=$($masters.productoGlobalId)&zonaGlobalId=$($masters.zonaGlobalId)&mesaGlobalId=$($masters.mesaGlobalId)"
}
function SecurityStatus([string]$nodeBase) {
  GetJson "$nodeBase/sync/internal/certification/security/status?restauranteGlobalId=$($security.restauranteGlobalId)&sucursalGlobalId=$($security.sucursalGlobalId)&usuarioGlobalId=$($security.usuarioGlobalId)"
}
function ConfigStatus([string]$nodeBase) {
  GetJson "$nodeBase/sync/internal/certification/config/status?restauranteGlobalId=$($config.restauranteGlobalId)&sucursalGlobalId=$($config.sucursalGlobalId)"
}

$gatewayStopped = $false
try {
  Write-Host '[1/10] Comprobando salud, contratos y tomando linea base de sincronizacion...'
  $null = GetJson "$edge/health/ready"
  $null = GetJson "$cloud/health/ready"
  $edgeBaseline = GetJson "$edge/sync/internal/certification/status"
  $cloudBaseline = GetJson "$cloud/sync/internal/certification/status"

  # Preflight de contratos GET antes de cortar Cloud.
  $requiredUrls = @(
    "$edge/sync/internal/certification/inventory/status?articuloGlobalId=$($inventory.articuloGlobalId)&productoGlobalId=$($inventory.productoGlobalId)",
    "$cloud/sync/internal/certification/inventory/status?articuloGlobalId=$($inventory.articuloGlobalId)&productoGlobalId=$($inventory.productoGlobalId)",
    "$edge/sync/internal/certification/masters/status?restauranteGlobalId=$($masters.restauranteGlobalId)&sucursalGlobalId=$($masters.sucursalGlobalId)&categoriaGlobalId=$($masters.categoriaGlobalId)&productoGlobalId=$($masters.productoGlobalId)&zonaGlobalId=$($masters.zonaGlobalId)&mesaGlobalId=$($masters.mesaGlobalId)",
    "$edge/sync/internal/certification/security/status?restauranteGlobalId=$($security.restauranteGlobalId)&sucursalGlobalId=$($security.sucursalGlobalId)&usuarioGlobalId=$($security.usuarioGlobalId)",
    "$edge/sync/internal/certification/config/status?restauranteGlobalId=$($config.restauranteGlobalId)&sucursalGlobalId=$($config.sucursalGlobalId)"
  )
  foreach ($urlCheck in $requiredUrls) {
    $null = GetJson $urlCheck
  }

  Write-Host '[2/10] Preparando un mismo tenant en todos los dominios...'
  foreach ($nodeBase in @($edge, $cloud)) {
    PostJson "$nodeBase/sync/internal/certification/business/setup" $base | Out-Null
    PostJson "$nodeBase/sync/internal/certification/money/setup" $money | Out-Null
    PostJson "$nodeBase/sync/internal/certification/inventory/setup" $inventory | Out-Null
    PostJson "$nodeBase/sync/internal/certification/loyalty/setup" $loyalty | Out-Null
    PostJson "$nodeBase/sync/internal/certification/masters/setup" $masters | Out-Null
    PostJson "$nodeBase/sync/internal/certification/security/setup" $security | Out-Null
    PostJson "$nodeBase/sync/internal/certification/config/setup" $config | Out-Null
  }
  $pendingBefore = [int](GetJson "$edge/sync/internal/certification/status").outboxPendiente

  Write-Host '[3/10] Simulando perdida total de acceso de EDGE a Cloud...'
  docker stop $cloudGateway | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible detener temporalmente el gateway Cloud.' }
  $gatewayStopped = $true
  Start-Sleep -Seconds 1

  Write-Host '[4/10] Operando offline en 7 dominios mientras Cloud no es accesible...'
  $businessFlow = PostJson "$edge/sync/internal/certification/business/create-edge-flow" $base
  $moneyFlow = PostJson "$edge/sync/internal/certification/money/create-edge-flow" $money
  $inventoryFlow = PostJson "$edge/sync/internal/certification/inventory/create-edge-flow" $inventory
  $null = PostJson "$edge/sync/internal/certification/loyalty/create-edge-flow" $loyalty
  $null = PostJson "$edge/sync/internal/certification/masters/create-edge-flow" $masters
  $null = PostJson "$edge/sync/internal/certification/security/create-edge-flow" $security
  $null = PostJson "$edge/sync/internal/certification/config/create-edge-flow" $config

  Start-Sleep -Milliseconds 1500
  $offlineStatus = GetJson "$edge/sync/internal/certification/status"
  $pendingDelta = [int]$offlineStatus.outboxPendiente - $pendingBefore
  if ($pendingDelta -lt 15) {
    throw "La cola offline no crecio como se esperaba. Delta=$pendingDelta pendiente=$($offlineStatus.outboxPendiente)"
  }

  Write-Host '[5/10] Recuperando Cloud y drenando la cola EDGE -> CLOUD...'
  docker start $cloudGateway | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible recuperar el gateway Cloud.' }
  $gatewayStopped = $false
  Wait-Cloud
  Start-Sleep -Seconds 1

  $cloudReady = $false
  for ($i = 0; $i -lt 50; $i++) {
    PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null
    Start-Sleep -Milliseconds 550

    $cb = BusinessStatus $cloud $businessFlow
    $cm = MoneyStatus $cloud $moneyFlow
    $ci = InventoryStatus $cloud
    $cl = LoyaltyStatus $cloud
    $cma = MastersStatus $cloud
    $cs = SecurityStatus $cloud
    $cc = ConfigStatus $cloud

    $loyaltyOk = $cl.cliente -and $cl.cliente.cuenta -and `
      [int]$cl.cliente.cuenta.saldoPuntos -eq 120 -and `
      @($cl.cliente.cuenta.movimientos).Count -eq 1 -and `
      @($cl.cliente.consentimientos | Where-Object { $_.canal -eq 'WHATSAPP' }).Count -eq 1

    $cloudReady =
      ($cb.pedido -and $cb.comanda -and $cb.domicilio) -and
      ($cm.venta -and @($cm.venta.pagos).Count -eq 2 -and $cm.caja) -and
      ($ci.articulo -and $ci.producto -and
        [decimal]$ci.articulo.stock -eq 500 -and
        @($ci.articulo.movimientos | Where-Object { $_.globalId -eq $inventoryFlow.movimientoArticuloGlobalId }).Count -eq 1 -and
        @($ci.producto.movimientos | Where-Object { $_.globalId -eq $inventoryFlow.movimientoProductoGlobalId }).Count -eq 1) -and
      $loyaltyOk -and
      ($cma.categoria -and $cma.producto -and $cma.zona -and $cma.mesa -and @($cma.producto.modificadores).Count -eq 2) -and
      ($cs.usuario -and $cs.usuario.activo -eq $true -and $cs.usuario.passwordEdge -eq $true) -and
      ($cc.sucursal.ZONA_HORARIA -eq 'America/Bogota' -and [int]$cc.sucursal.ANCHO_PAPEL -eq 58 -and $cc.sucursal.QR_REQUIERE_ACEPTACION -eq $false)

    if ($cloudReady) { break }
  }
  if (-not $cloudReady) { throw 'La convergencia EDGE -> CLOUD no completo todos los dominios dentro del tiempo esperado.' }

  Write-Host '[6/10] Generando cambios CLOUD -> EDGE en los mismos dominios...'
  $null = PostJson "$cloud/sync/internal/certification/business/update-cloud" @{
    comandaGlobalId = $businessFlow.comandaGlobalId
    domicilioGlobalId = $businessFlow.domicilioGlobalId
  }
  $moneyChange = PostJson "$cloud/sync/internal/certification/money/update-cloud" @{
    cajaGlobalId = $moneyFlow.cajaGlobalId
    usuarioGlobalId = $money.usuarioGlobalId
  }
  $inventoryChange = PostJson "$cloud/sync/internal/certification/inventory/update-cloud" @{
    articuloGlobalId = $inventory.articuloGlobalId
    usuarioGlobalId = $inventory.usuarioGlobalId
  }
  $loyaltyChange = PostJson "$cloud/sync/internal/certification/loyalty/update-cloud" $loyalty
  $null = PostJson "$cloud/sync/internal/certification/masters/update-cloud" $masters
  $null = PostJson "$cloud/sync/internal/certification/security/update-cloud" $security
  $null = PostJson "$cloud/sync/internal/certification/config/update-cloud" $config

  Write-Host '[7/10] Ejecutando pull + ACK y esperando convergencia CLOUD -> EDGE...'
  $edgeReady = $false
  for ($i = 0; $i -lt 60; $i++) {
    $lastCycle = PostJson "$edge/sync/internal/certification/cycle" @{}
    Start-Sleep -Milliseconds 550

    $eb = BusinessStatus $edge $businessFlow
    $em = MoneyStatus $edge $moneyFlow
    $ei = InventoryStatus $edge
    $el = LoyaltyStatus $edge
    $ema = MastersStatus $edge
    $es = SecurityStatus $edge
    $ec = ConfigStatus $edge

    $moneyMoveCount = @($em.caja.movimientos | Where-Object { $_.globalId -eq $moneyChange.movimientoCajaGlobalId }).Count
    $inventoryMoveCount = @($ei.articulo.movimientos | Where-Object { $_.globalId -eq $inventoryChange.movimientoGlobalId }).Count
    $edgeWa = @($el.cliente.consentimientos | Where-Object { $_.canal -eq 'WHATSAPP' })
    $perms = @($es.rol.permisos | Sort-Object)
    $extraQueso = @($ema.producto.modificadores | Where-Object { $_.nombre -eq 'Extra queso' })

    $edgeReady =
      ($eb.pedido.estado -eq 'EN_PREPARACION' -and $eb.comanda.estado -eq 'EN_PREPARACION' -and $eb.domicilio.estado -eq 'CANCELADO') -and
      (@($em.venta.pagos).Count -eq 2 -and [decimal]$em.venta.totalPagado -eq 100000 -and $moneyMoveCount -eq 1) -and
      ($ei.articulo -and [decimal]$ei.articulo.stock -eq 425 -and $inventoryMoveCount -eq 1) -and
      ([int]$el.cliente.cuenta.saldoPuntos -eq 100 -and @($el.cliente.cuenta.movimientos).Count -eq 2 -and
        $edgeWa.Count -eq 1 -and $edgeWa[0].otorgado -eq $false -and $el.cliente.telefono -eq '3019998877') -and
      ($ema.categoria.nombre -eq 'Hamburguesas Sync CLOUD' -and [decimal]$ema.producto.precio -eq 19900 -and
        $ema.producto.disponible -eq $false -and $ema.zona.nombre -eq 'Terraza Sync CLOUD' -and
        $ema.mesa.numero -eq 'M-SYNC-9' -and $extraQueso.Count -eq 1 -and [decimal]$extraQueso[0].precio -eq 3000) -and
      ($es.usuario.activo -eq $false -and $es.usuario.passwordCloud -eq $true -and
        ($perms -join ',') -eq 'SYNC48D2F_MANAGE,SYNC48D2F_VIEW') -and
      ($ec.restaurante.MONEDA -eq 'COP' -and [int]$ec.restaurante.PORCENTAJE_IMPUESTO -eq 19 -and
        $ec.restaurante.TEMA_COLOR_ACENTO -eq '#112233' -and [int]$ec.sucursal.ANCHO_PAPEL -eq 80 -and
        $ec.sucursal.QR_REQUIERE_ACEPTACION -eq $true)

    if ($edgeReady) { break }
  }
  if (-not $edgeReady) {
    $detail = ''
    if ($lastCycle.applyErrorDetails) {
      $detail = (@($lastCycle.applyErrorDetails | ForEach-Object { $_.eventType + ':' + $_.status + ':' + $_.error }) -join ' | ')
    }
    throw "La convergencia CLOUD -> EDGE no completo todos los dominios. applyErrors=$($lastCycle.applyErrors) errores=[$detail]"
  }

  Write-Host '[8/10] Verificando igualdad final e identidades sin duplicacion...'
  $cbFinal = BusinessStatus $cloud $businessFlow
  $cmFinal = MoneyStatus $cloud $moneyFlow
  $ciFinal = InventoryStatus $cloud
  $clFinal = LoyaltyStatus $cloud
  $cmaFinal = MastersStatus $cloud
  $csFinal = SecurityStatus $cloud
  $ccFinal = ConfigStatus $cloud

  if ([int]$eb.pedido.detalles -ne 1 -or [int]$cbFinal.pedido.detalles -ne 1) { throw 'Pedido/DetallePedido quedo duplicado o divergente.' }
  if ([int]$eb.comanda.detalles -ne 1 -or [int]$cbFinal.comanda.detalles -ne 1) { throw 'Comanda/DetalleComanda quedo duplicada o divergente.' }
  if (@($em.venta.pagos).Count -ne 2 -or @($cmFinal.venta.pagos).Count -ne 2) { throw 'Pagos quedaron duplicados o divergentes.' }
  if (@($em.caja.movimientos | Where-Object { $_.globalId -eq $moneyChange.movimientoCajaGlobalId }).Count -ne 1 -or
      @($cmFinal.caja.movimientos | Where-Object { $_.globalId -eq $moneyChange.movimientoCajaGlobalId }).Count -ne 1) {
    throw 'MovimientoCaja Cloud->EDGE no es idempotente.'
  }
  if (@($ei.articulo.movimientos | Where-Object { $_.globalId -eq $inventoryChange.movimientoGlobalId }).Count -ne 1 -or
      @($ciFinal.articulo.movimientos | Where-Object { $_.globalId -eq $inventoryChange.movimientoGlobalId }).Count -ne 1) {
    throw 'MovimientoInventario Cloud->EDGE no es idempotente.'
  }
  if ([decimal]$ei.articulo.stock -ne 425 -or [decimal]$ciFinal.articulo.stock -ne 425) {
    throw "Stock de Articulo no converge. EDGE=$($ei.articulo.stock) CLOUD=$($ciFinal.articulo.stock) esperado=425"
  }
  if (@($el.cliente.cuenta.movimientos).Count -ne 2 -or @($clFinal.cliente.cuenta.movimientos).Count -ne 2) {
    throw 'Fidelizacion quedo duplicada o divergente.'
  }
  if (@($ema.producto.modificadores).Count -ne 2 -or @($cmaFinal.producto.modificadores).Count -ne 2) {
    throw 'Modificadores quedaron duplicados.'
  }
  if ($csFinal.usuario.activo -ne $false -or $csFinal.usuario.passwordCloud -ne $true) { throw 'Seguridad no converge en Cloud.' }
  if ([int]$ccFinal.sucursal.ANCHO_PAPEL -ne 80 -or [int]$ccFinal.restaurante.PORCENTAJE_IMPUESTO -ne 19) { throw 'Configuracion no converge en Cloud.' }

  Write-Host '[9/10] Ejecutando ciclo extra at-least-once y comprobando ausencia de regresiones...'
  PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null
  Start-Sleep -Milliseconds 700
  $afterMoney = MoneyStatus $edge $moneyFlow
  $afterInventory = InventoryStatus $edge
  $afterLoyalty = LoyaltyStatus $edge
  $afterMasters = MastersStatus $edge
  if (@($afterMoney.venta.pagos).Count -ne 2) { throw 'Ciclo extra duplico pagos.' }
  if (@($afterMoney.caja.movimientos | Where-Object { $_.globalId -eq $moneyChange.movimientoCajaGlobalId }).Count -ne 1) { throw 'Ciclo extra duplico MovimientoCaja.' }
  if (@($afterInventory.articulo.movimientos | Where-Object { $_.globalId -eq $inventoryChange.movimientoGlobalId }).Count -ne 1) { throw 'Ciclo extra duplico MovimientoInventario.' }
  if (@($afterLoyalty.cliente.cuenta.movimientos).Count -ne 2) { throw 'Ciclo extra duplico MovimientoPuntos.' }
  if (@($afterMasters.producto.modificadores).Count -ne 2) { throw 'Ciclo extra duplico modificadores.' }

  Write-Host '[10/10] Comprobando salud de inbox/outbox frente a la linea base...'
  $edgeFinalSync = GetJson "$edge/sync/internal/certification/status"
  $cloudFinalSync = GetJson "$cloud/sync/internal/certification/status"
  if ([int]$edgeFinalSync.inboxError -gt [int]$edgeBaseline.inboxError) {
    throw "EDGE termino con nuevos Inbox ERROR. Antes=$($edgeBaseline.inboxError) Ahora=$($edgeFinalSync.inboxError)"
  }
  if ([int]$cloudFinalSync.inboxError -gt [int]$cloudBaseline.inboxError) {
    throw "CLOUD termino con nuevos Inbox ERROR. Antes=$($cloudBaseline.inboxError) Ahora=$($cloudFinalSync.inboxError)"
  }

  Write-Host ''
  Write-Host 'SIGR SYNC 48D CIERRE INTEGRAL OK' -ForegroundColor Green
  Write-Host "Restaurante: $($tenant.restauranteGlobalId)"
  Write-Host "Sucursal:    $($tenant.sucursalGlobalId)"
  Write-Host "Pedido:      $($businessFlow.pedidoGlobalId)"
  Write-Host "Venta:       $($moneyFlow.ventaGlobalId)"
  Write-Host "Articulo:    $($inventory.articuloGlobalId)"
  Write-Host "Cliente:     $($loyalty.clienteGlobalId)"
  Write-Host "Mesa:        $($masters.mesaGlobalId)"
  Write-Host "Usuario:     $($security.usuarioGlobalId)"
  Write-Host "Cola offline acumulada durante la caida: +$pendingDelta eventos."
  Write-Host 'Caida unica de Cloud, operacion multidominio offline, recuperacion, convergencia bidireccional, ACK e idempotencia integral certificados.'
}
finally {
  if ($gatewayStopped) {
    Write-Host ''
    Write-Host 'Restaurando gateway Cloud despues de la certificacion...'
    docker start $cloudGateway | Out-Null
  }
}
