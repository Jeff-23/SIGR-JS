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
}
function StatusUrl($base) {
  return "$base/sync/internal/certification/config/status?restauranteGlobalId=$($ids.restauranteGlobalId)&sucursalGlobalId=$($ids.sucursalGlobalId)"
}

Write-Host '[1/9] Preparando restaurante y sucursal de configuracion en EDGE y CLOUD...'
PostJson "$edge/sync/internal/certification/config/setup" $ids | Out-Null
PostJson "$cloud/sync/internal/certification/config/setup" $ids | Out-Null

Write-Host '[2/9] Simulando Cloud fuera de linea...'
try { docker stop sigr-cloud-smoke-gateway-1 | Out-Null } catch {}
Start-Sleep -Seconds 1

Write-Host '[3/9] Configurando sucursal en EDGE sin Cloud...'
$created = PostJson "$edge/sync/internal/certification/config/create-edge-flow" $ids
if ($created.eventos.zona -lt 1 -or $created.eventos.papel -lt 1 -or $created.eventos.qr -lt 1) { throw 'EDGE no genero todos los eventos de configuracion de sucursal.' }

Write-Host '[4/9] Recuperando Cloud y sincronizando EDGE -> CLOUD...'
try { docker start sigr-cloud-smoke-gateway-1 | Out-Null } catch {}
Start-Sleep -Seconds 2
$cloudState = $null
for ($i=0; $i -lt 30; $i++) {
  PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null
  Start-Sleep -Milliseconds 500
  $cloudState = GetJson (StatusUrl $cloud)
  if ($cloudState.sucursal.ZONA_HORARIA -eq 'America/Bogota' -and $cloudState.sucursal.ANCHO_PAPEL -eq 58 -and $cloudState.sucursal.QR_REQUIERE_ACEPTACION -eq $false) { break }
}

Write-Host '[5/9] Verificando parametros de sucursal en CLOUD...'
if ($cloudState.sucursal.ZONA_HORARIA -ne 'America/Bogota') { throw 'ZONA_HORARIA no llego a CLOUD.' }
if ($cloudState.sucursal.ANCHO_PAPEL -ne 58) { throw 'ANCHO_PAPEL EDGE->CLOUD no converge.' }
if ($cloudState.sucursal.QR_REQUIERE_ACEPTACION -ne $false) { throw 'QR_REQUIERE_ACEPTACION EDGE->CLOUD no converge.' }

Write-Host '[6/9] Reencolando configuracion para probar idempotencia...'
$requeue = PostJson "$edge/sync/internal/certification/config/requeue" $ids
if ($requeue.eventos -lt 3) { throw 'No se reencolaron todos los parametros de sucursal.' }
for ($i=0; $i -lt 5; $i++) { PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null; Start-Sleep -Milliseconds 350 }
$cloudAgain = GetJson (StatusUrl $cloud)
if ($cloudAgain.sucursal.ANCHO_PAPEL -ne 58 -or $cloudAgain.sucursal.QR_REQUIERE_ACEPTACION -ne $false) { throw 'Reenvio idempotente altero la configuracion.' }

Write-Host '[7/9] Actualizando configuracion global y de sucursal en CLOUD...'
$change = PostJson "$cloud/sync/internal/certification/config/update-cloud" $ids
if ($change.eventos.moneda -lt 1 -or $change.eventos.impuesto -lt 1 -or $change.eventos.tema -lt 1 -or $change.eventos.papel -lt 1 -or $change.eventos.qr -lt 1) { throw 'CLOUD no genero todos los eventos de configuracion hacia EDGE.' }

Write-Host '[8/9] EDGE hace pull + ACK...'
$edgeState = $null
for ($i=0; $i -lt 30; $i++) {
  PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null
  Start-Sleep -Milliseconds 500
  $edgeState = GetJson (StatusUrl $edge)
  if ($edgeState.restaurante.MONEDA -eq 'COP' -and $edgeState.restaurante.PORCENTAJE_IMPUESTO -eq 19 -and $edgeState.restaurante.TEMA_COLOR_ACENTO -eq '#112233' -and $edgeState.sucursal.ANCHO_PAPEL -eq 80 -and $edgeState.sucursal.QR_REQUIERE_ACEPTACION -eq $true) { break }
}

Write-Host '[9/9] Verificando jerarquia, convergencia e idempotencia final...'
$cloudFinal = GetJson (StatusUrl $cloud)
if ($edgeState.restaurante.MONEDA -ne 'COP' -or $cloudFinal.restaurante.MONEDA -ne 'COP') { throw 'MONEDA de restaurante no converge.' }
if ($edgeState.restaurante.PORCENTAJE_IMPUESTO -ne 19 -or $cloudFinal.restaurante.PORCENTAJE_IMPUESTO -ne 19) { throw 'Impuesto global no converge.' }
if ($edgeState.restaurante.TEMA_COLOR_ACENTO -ne '#112233') { throw 'Identidad visual global no llego a EDGE.' }
if ($edgeState.sucursal.ANCHO_PAPEL -ne 80 -or $cloudFinal.sucursal.ANCHO_PAPEL -ne 80) { throw 'Override ANCHO_PAPEL de sucursal no converge.' }
if ($edgeState.sucursal.QR_REQUIERE_ACEPTACION -ne $true) { throw 'QR_REQUIERE_ACEPTACION CLOUD->EDGE no converge.' }
if ($edgeState.efectiva.ANCHO_PAPEL -ne 80 -or $edgeState.efectiva.PORCENTAJE_IMPUESTO -ne 19) { throw 'Configuracion efectiva no respeta la jerarquia restaurante/sucursal.' }

Write-Host ''
Write-Host 'SIGR SYNC 48D-2G OK' -ForegroundColor Green
Write-Host "Restaurante: $($ids.restauranteGlobalId)"
Write-Host "Sucursal:    $($ids.sucursalGlobalId)"
Write-Host 'Configuracion global CLOUD->EDGE, parametros de sucursal bidireccionales, jerarquia e idempotencia certificados.'
