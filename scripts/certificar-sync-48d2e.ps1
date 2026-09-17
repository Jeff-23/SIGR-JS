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
  zonaGlobalId = New-Id
  mesaGlobalId = New-Id
}
function StatusUrl($base) {
  return "$base/sync/internal/certification/masters/status?restauranteGlobalId=$($ids.restauranteGlobalId)&sucursalGlobalId=$($ids.sucursalGlobalId)&categoriaGlobalId=$($ids.categoriaGlobalId)&productoGlobalId=$($ids.productoGlobalId)&zonaGlobalId=$($ids.zonaGlobalId)&mesaGlobalId=$($ids.mesaGlobalId)"
}
Write-Host '[1/9] Preparando restaurante/sucursal de maestros en EDGE y CLOUD...'
PostJson "$edge/sync/internal/certification/masters/setup" $ids | Out-Null
PostJson "$cloud/sync/internal/certification/masters/setup" $ids | Out-Null
Write-Host '[2/9] Simulando Cloud fuera de linea...'
try { docker stop sigr-cloud-smoke-gateway-1 | Out-Null } catch {}
Start-Sleep -Seconds 1
Write-Host '[3/9] Creando categoria + producto/modificadores + zona + mesa en EDGE...'
PostJson "$edge/sync/internal/certification/masters/create-edge-flow" $ids | Out-Null
Write-Host '[4/9] Recuperando Cloud y sincronizando EDGE -> CLOUD...'
try { docker start sigr-cloud-smoke-gateway-1 | Out-Null } catch {}
Start-Sleep -Seconds 2
$cloudState = $null
for ($i=0; $i -lt 30; $i++) {
  PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null
  Start-Sleep -Milliseconds 500
  $cloudState = GetJson (StatusUrl $cloud)
  if ($cloudState.categoria -and $cloudState.producto -and $cloudState.zona -and $cloudState.mesa -and @($cloudState.producto.modificadores).Count -eq 2) { break }
}
Write-Host '[5/9] Verificando maestros en CLOUD...'
if (-not $cloudState.categoria -or -not $cloudState.producto -or -not $cloudState.zona -or -not $cloudState.mesa) { throw 'Maestros EDGE->CLOUD incompletos.' }
if ($cloudState.producto.precio -ne '18500' -and $cloudState.producto.precio -ne '18500.00') { throw "Precio inicial Cloud incorrecto: $($cloudState.producto.precio)" }
if (@($cloudState.producto.modificadores).Count -ne 2) { throw 'Modificadores no convergieron en CLOUD.' }
Write-Host '[6/9] Reencolando los mismos maestros para probar idempotencia...'
PostJson "$edge/sync/internal/certification/masters/requeue" $ids | Out-Null
for ($i=0; $i -lt 5; $i++) { PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null; Start-Sleep -Milliseconds 350 }
$cloudAgain = GetJson (StatusUrl $cloud)
if (@($cloudAgain.producto.modificadores).Count -ne 2) { throw 'Reenvio duplico modificadores.' }
Write-Host '[7/9] Actualizando maestros en CLOUD...'
$change = PostJson "$cloud/sync/internal/certification/masters/update-cloud" $ids
if ($change.eventos.producto -lt 1 -or $change.eventos.mesa -lt 1) { throw 'Cloud no genero eventos maestros hacia EDGE.' }
Write-Host '[8/9] EDGE hace pull + ACK...'
$edgeState = $null
for ($i=0; $i -lt 30; $i++) {
  $cycle = PostJson "$edge/sync/internal/certification/cycle" @{}
  Start-Sleep -Milliseconds 500
  $edgeState = GetJson (StatusUrl $edge)
  $extra = @($edgeState.producto.modificadores | Where-Object nombre -eq 'Extra queso')
  if ($edgeState.categoria.nombre -eq 'Hamburguesas Sync CLOUD' -and $edgeState.producto.disponible -eq $false -and $edgeState.zona.nombre -eq 'Terraza Sync CLOUD' -and $edgeState.mesa.numero -eq 'M-SYNC-9' -and $extra.Count -eq 1 -and [decimal]$extra[0].precio -eq 3000) { break }
}
Write-Host '[9/9] Verificando convergencia e idempotencia final...'
$cloudFinal = GetJson (StatusUrl $cloud)
if ($edgeState.categoria.nombre -ne $cloudFinal.categoria.nombre) { throw 'Categoria no converge.' }
if ([decimal]$edgeState.producto.precio -ne 19900 -or [decimal]$cloudFinal.producto.precio -ne 19900) { throw 'Precio de producto no converge.' }
if ($edgeState.producto.disponible -ne $false -or $cloudFinal.producto.disponible -ne $false) { throw 'Disponibilidad de producto no converge.' }
if ($edgeState.zona.nombre -ne 'Terraza Sync CLOUD' -or $cloudFinal.zona.nombre -ne 'Terraza Sync CLOUD') { throw 'Zona no converge.' }
if ($edgeState.mesa.numero -ne 'M-SYNC-9' -or $cloudFinal.mesa.numero -ne 'M-SYNC-9' -or $edgeState.mesa.capacidad -ne 6) { throw 'Mesa no converge.' }
if (@($edgeState.producto.modificadores).Count -ne 2 -or @($cloudFinal.producto.modificadores).Count -ne 2) { throw 'Modificadores duplicados tras sincronizacion.' }
Write-Host ''
Write-Host 'SIGR SYNC 48D-2E OK' -ForegroundColor Green
Write-Host "Categoria: $($ids.categoriaGlobalId)"
Write-Host "Producto:  $($ids.productoGlobalId)"
Write-Host "Zona:      $($ids.zonaGlobalId)"
Write-Host "Mesa:      $($ids.mesaGlobalId)"
Write-Host 'Categoria, producto, modificadores, zona, mesa, reenvio idempotente y flujo bidireccional certificados.'
