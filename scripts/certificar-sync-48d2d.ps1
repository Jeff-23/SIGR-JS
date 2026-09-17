$ErrorActionPreference = 'Stop'
$edge = 'http://localhost:8080/api'
$cloud = 'http://localhost:8081/api'

$envFile = Join-Path $PSScriptRoot '..\deploy\sync\.env.smoke'
$certKey = $null
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^SYNC_CERT_KEY=' } | Select-Object -First 1
  if ($line) { $certKey = ($line -split '=',2)[1].Trim() }
}
if (-not $certKey) { throw 'No se encontro SYNC_CERT_KEY en deploy\sync\.env.smoke' }
$headers = @{ 'x-sigr-cert-key' = $certKey }

function PostJson($url, $body) { Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 20) }
function GetJson($url) { Invoke-RestMethod -Method Get -Uri $url -Headers $headers }
function New-Id { [guid]::NewGuid().ToString() }

$ids = [ordered]@{
  restauranteGlobalId = New-Id
  sucursalGlobalId = New-Id
  categoriaGlobalId = New-Id
  productoGlobalId = New-Id
  estacionGlobalId = New-Id
  usuarioGlobalId = New-Id
  clienteGlobalId = New-Id
  nivelGlobalId = New-Id
  cuentaGlobalId = New-Id
  movimientoGlobalId = New-Id
  consentimientoGlobalId = New-Id
}

Write-Host '[1/9] Preparando cliente y referencias iguales en EDGE y CLOUD...'
PostJson "$edge/sync/internal/certification/loyalty/setup" $ids | Out-Null
PostJson "$cloud/sync/internal/certification/loyalty/setup" $ids | Out-Null

Write-Host '[2/9] Simulando Cloud fuera de linea...'
try { docker stop sigr-cloud-smoke-gateway-1 | Out-Null } catch {}
Start-Sleep -Seconds 1

Write-Host '[3/9] Creando cliente + cuenta + puntos + consentimiento en EDGE sin Cloud...'
$created = PostJson "$edge/sync/internal/certification/loyalty/create-edge-flow" $ids

Write-Host '[4/9] Recuperando Cloud y sincronizando EDGE -> CLOUD...'
try { docker start sigr-cloud-smoke-gateway-1 | Out-Null } catch {}
Start-Sleep -Seconds 2
for ($i=0; $i -lt 30; $i++) {
  PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null
  Start-Sleep -Milliseconds 500
  $cloudStatus = GetJson "$cloud/sync/internal/certification/loyalty/status?clienteGlobalId=$($ids.clienteGlobalId)"
  if ($null -ne $cloudStatus.cliente) {
    $cloudWaCount = @($cloudStatus.cliente.consentimientos | Where-Object canal -eq 'WHATSAPP').Count
    $cloudMovCount = @($cloudStatus.cliente.cuenta.movimientos).Count
    if ($cloudStatus.cliente.cuenta.saldoPuntos -eq 120 -and $cloudMovCount -eq 1 -and $cloudWaCount -eq 1) { break }
  }
}

Write-Host '[5/9] Verificando cliente, fidelizacion y consentimiento en CLOUD...'
$cloudStatus = GetJson "$cloud/sync/internal/certification/loyalty/status?clienteGlobalId=$($ids.clienteGlobalId)"
if ($null -eq $cloudStatus.cliente) { throw 'Cliente no llego a CLOUD.' }
if ($cloudStatus.cliente.cuenta.saldoPuntos -ne 120) { throw 'Saldo inicial no convergio en CLOUD.' }
if ($cloudStatus.cliente.cuenta.movimientos.Count -ne 1) { throw 'Movimiento inicial falta o esta duplicado en CLOUD.' }
if (@($cloudStatus.cliente.consentimientos | Where-Object canal -eq 'WHATSAPP').Count -ne 1) { throw 'Consentimiento falta o esta duplicado en CLOUD.' }

Write-Host '[6/9] Reencolando los mismos agregados para probar idempotencia...'
PostJson "$edge/sync/internal/certification/loyalty/requeue" $ids | Out-Null
for ($i=0; $i -lt 5; $i++) { PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null; Start-Sleep -Milliseconds 350 }
$cloudAgain = GetJson "$cloud/sync/internal/certification/loyalty/status?clienteGlobalId=$($ids.clienteGlobalId)"
if (@($cloudAgain.cliente.cuenta.movimientos).Count -ne 1) { throw 'Reenvio duplico MovimientoPuntos.' }
if (@($cloudAgain.cliente.consentimientos | Where-Object canal -eq 'WHATSAPP').Count -ne 1) { throw 'Reenvio duplico ConsentimientoCliente.' }

Write-Host '[7/9] Generando ajuste de fidelizacion CLOUD -> EDGE...'
$cloudChange = PostJson "$cloud/sync/internal/certification/loyalty/update-cloud" $ids

Write-Host '[8/9] EDGE hace pull + ACK...'
for ($i=0; $i -lt 30; $i++) {
  PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null
  Start-Sleep -Milliseconds 500
  $edgeStatus = GetJson "$edge/sync/internal/certification/loyalty/status?clienteGlobalId=$($ids.clienteGlobalId)"
  if ($null -ne $edgeStatus.cliente) {
    $edgeWa = @($edgeStatus.cliente.consentimientos | Where-Object canal -eq 'WHATSAPP')
    $edgeMovCount = @($edgeStatus.cliente.cuenta.movimientos).Count
    if ($edgeStatus.cliente.cuenta.saldoPuntos -eq 100 -and $edgeMovCount -eq 2 -and $edgeWa.Count -eq 1 -and $edgeWa[0].otorgado -eq $false -and $edgeStatus.cliente.telefono -eq '3019998877') { break }
  }
}

Write-Host '[9/9] Verificando convergencia e idempotencia final...'
$edgeStatus = GetJson "$edge/sync/internal/certification/loyalty/status?clienteGlobalId=$($ids.clienteGlobalId)"
$cloudStatus = GetJson "$cloud/sync/internal/certification/loyalty/status?clienteGlobalId=$($ids.clienteGlobalId)"
if ($edgeStatus.cliente.cuenta.saldoPuntos -ne 100 -or $cloudStatus.cliente.cuenta.saldoPuntos -ne 100) { throw 'Saldo de puntos no convergio a 100.' }
if ($edgeStatus.cliente.cuenta.movimientos.Count -ne 2 -or $cloudStatus.cliente.cuenta.movimientos.Count -ne 2) { throw 'Movimientos de puntos no convergieron exactamente a 2.' }
$edgeWa = $edgeStatus.cliente.consentimientos | Where-Object canal -eq 'WHATSAPP'
$cloudWa = $cloudStatus.cliente.consentimientos | Where-Object canal -eq 'WHATSAPP'
if ($edgeWa.otorgado -ne $false -or $cloudWa.otorgado -ne $false) { throw 'Revocacion de consentimiento no convergio.' }
if ($edgeStatus.cliente.telefono -ne '3019998877' -or $cloudStatus.cliente.telefono -ne '3019998877') { throw 'Actualizacion de cliente Cloud->EDGE no convergio.' }

Write-Host ''
Write-Host 'SIGR SYNC 48D-2D OK' -ForegroundColor Green
Write-Host "Cliente: $($ids.clienteGlobalId)"
Write-Host "Cuenta fidelizacion: $($ids.cuentaGlobalId)"
Write-Host "Movimiento EDGE -> CLOUD: $($ids.movimientoGlobalId)"
Write-Host "Movimiento CLOUD -> EDGE: $($cloudChange.movimientoCloudGlobalId)"
Write-Host 'Cliente, nivel, cuenta, puntos, consentimiento, reenvio idempotente y flujo bidireccional certificados.'
