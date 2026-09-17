$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$syncFile = Join-Path $root 'deploy\sync\.env.smoke'
if (-not (Test-Path $syncFile)) { throw 'Falta deploy\sync\.env.smoke.' }
function Read-EnvFile([string]$path) { $map=@{}; Get-Content $path | ForEach-Object { $line=$_.Trim(); if($line -and -not $line.StartsWith('#') -and $line.Contains('=')){ $parts=$line.Split('=',2); $map[$parts[0].Trim()]=$parts[1].Trim() } }; return $map }
function Post-Json([string]$url,[hashtable]$headers,$body){ Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' -Body ($body|ConvertTo-Json -Depth 30 -Compress) -TimeoutSec 20 }
function Get-Json([string]$url,[hashtable]$headers){ Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 20 }
function Wait-Healthy([string]$container,[int]$seconds=45){ $limit=(Get-Date).AddSeconds($seconds); do { $state=docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $container 2>$null; if($LASTEXITCODE -eq 0 -and ($state -eq 'healthy' -or $state -eq 'running')){return}; Start-Sleep -Seconds 1 } while((Get-Date)-lt $limit); throw "El contenedor $container no quedo saludable." }
$cfg=Read-EnvFile $syncFile
$headers=@{'x-sigr-cert-key'=$cfg.SYNC_CERT_KEY}
$edge='http://localhost:8080/api'; $cloud='http://localhost:8081/api'; $cloudBackend='sigr-cloud-smoke-backend-1'
$ids=@{
 restauranteGlobalId=[guid]::NewGuid().ToString(); sucursalGlobalId=[guid]::NewGuid().ToString(); categoriaGlobalId=[guid]::NewGuid().ToString(); productoGlobalId=[guid]::NewGuid().ToString(); estacionGlobalId=[guid]::NewGuid().ToString(); usuarioGlobalId=[guid]::NewGuid().ToString(); metodoEfectivoGlobalId=[guid]::NewGuid().ToString(); metodoTarjetaGlobalId=[guid]::NewGuid().ToString(); articuloGlobalId=[guid]::NewGuid().ToString()
}
Write-Host '[1/9] Preparando articulo y referencias iguales en EDGE y CLOUD...'
$null=Post-Json "$edge/sync/internal/certification/inventory/setup" $headers $ids
$null=Post-Json "$cloud/sync/internal/certification/inventory/setup" $headers $ids
Write-Host '[2/9] Simulando Cloud fuera de linea...'
docker stop $cloudBackend | Out-Null; if($LASTEXITCODE -ne 0){throw 'No fue posible detener Cloud.'}
Write-Host '[3/9] Creando entrada de inventario real en EDGE sin Cloud...'
$flow=Post-Json "$edge/sync/internal/certification/inventory/create-edge-flow" $headers $ids
Start-Sleep -Milliseconds 1200
Write-Host '[4/9] Recuperando Cloud y sincronizando EDGE -> CLOUD...'
docker start $cloudBackend | Out-Null; Wait-Healthy $cloudBackend; Start-Sleep -Seconds 2
1..4|ForEach-Object{$null=Post-Json "$edge/sync/internal/certification/cycle" $headers @{}; Start-Sleep -Milliseconds 700}
Write-Host '[5/9] Verificando articulo, stock y movimiento en CLOUD...'
$q="articuloGlobalId=$($ids.articuloGlobalId)"
$cloudState=Get-Json "$cloud/sync/internal/certification/inventory/status?$q" $headers
if(-not $cloudState){throw 'Cloud no recibio Articulo.'}
if([decimal]$cloudState.stock -ne [decimal]$flow.stockEsperado){throw "Stock Cloud incorrecto: $($cloudState.stock)"}
if(@($cloudState.movimientos|Where-Object{$_.globalId -eq $flow.movimientoGlobalId}).Count -ne 1){throw 'Cloud no tiene exactamente un movimiento EDGE.'}
Write-Host '[6/9] Reencolando el mismo articulo y movimiento para probar idempotencia...'
$null=Post-Json "$edge/sync/internal/certification/inventory/requeue" $headers @{articuloGlobalId=$ids.articuloGlobalId;movimientoGlobalId=$flow.movimientoGlobalId}
1..3|ForEach-Object{$null=Post-Json "$edge/sync/internal/certification/cycle" $headers @{}; Start-Sleep -Milliseconds 600}
$repeat=Get-Json "$cloud/sync/internal/certification/inventory/status?$q" $headers
if(@($repeat.movimientos|Where-Object{$_.globalId -eq $flow.movimientoGlobalId}).Count -ne 1){throw 'Reenvio duplico MovimientoInventario.'}
if([decimal]$repeat.stock -ne [decimal]$flow.stockEsperado){throw 'Reenvio altero el stock.'}
Write-Host '[7/9] Generando ajuste de inventario CLOUD -> EDGE...'
$cloudChange=Post-Json "$cloud/sync/internal/certification/inventory/update-cloud" $headers @{articuloGlobalId=$ids.articuloGlobalId;usuarioGlobalId=$ids.usuarioGlobalId}
if([int]$cloudChange.eventosMovimiento -lt 1){throw 'Cloud no genero evento de inventario hacia EDGE.'}
Write-Host '[8/9] EDGE hace pull + ACK...'
$deadline=(Get-Date).AddSeconds(45); $last=$null; $edgeState=$null
 do { $last=Post-Json "$edge/sync/internal/certification/cycle" $headers @{}; Start-Sleep -Milliseconds 700; $edgeState=Get-Json "$edge/sync/internal/certification/inventory/status?$q" $headers; $mov=@($edgeState.movimientos|Where-Object{$_.globalId -eq $cloudChange.movimientoGlobalId}); if($mov.Count -eq 1){break} } while((Get-Date)-lt $deadline)
Write-Host '[9/9] Verificando convergencia e idempotencia final...'
$cloudFinal=Get-Json "$cloud/sync/internal/certification/inventory/status?$q" $headers
$edgeMov=@($edgeState.movimientos|Where-Object{$_.globalId -eq $cloudChange.movimientoGlobalId}); $cloudMov=@($cloudFinal.movimientos|Where-Object{$_.globalId -eq $cloudChange.movimientoGlobalId})
if($edgeMov.Count -ne 1 -or $cloudMov.Count -ne 1){ $detail=''; if($last.applyErrorDetails){$detail=(@($last.applyErrorDetails|ForEach-Object{$_.eventType+':'+$_.status+':'+$_.error}) -join ' | ')}; throw "MovimientoInventario Cloud->EDGE no convergio. fetched=$($last.fetched) applyErrors=$($last.applyErrors) errores=[$detail]" }
if([decimal]$edgeState.stock -ne [decimal]$cloudChange.stockEsperado -or [decimal]$cloudFinal.stock -ne [decimal]$cloudChange.stockEsperado){throw "Stock no converge. EDGE=$($edgeState.stock) CLOUD=$($cloudFinal.stock) esperado=$($cloudChange.stockEsperado)"}
$null=Post-Json "$edge/sync/internal/certification/cycle" $headers @{}
$edgeFinal=Get-Json "$edge/sync/internal/certification/inventory/status?$q" $headers
if(@($edgeFinal.movimientos|Where-Object{$_.globalId -eq $cloudChange.movimientoGlobalId}).Count -ne 1){throw 'Ciclo extra duplico MovimientoInventario.'}
Write-Host ''; Write-Host 'SIGR SYNC 48D-2C OK'; Write-Host "Articulo: $($ids.articuloGlobalId)"; Write-Host "Movimiento EDGE -> CLOUD: $($flow.movimientoGlobalId)"; Write-Host "Movimiento CLOUD -> EDGE: $($cloudChange.movimientoGlobalId)"; Write-Host "Stock convergente: $($cloudChange.stockEsperado)"; Write-Host 'Articulo, entradas/salidas, stock, reenvio idempotente y movimiento bidireccional certificados.'
