$ErrorActionPreference = 'Stop'

$edge = 'http://localhost:8080/api'
$cloud = 'http://localhost:8081/api'
$envFile = Join-Path $PSScriptRoot '..\deploy\sync\.env.smoke'
if (!(Test-Path $envFile)) { throw 'No existe deploy\sync\.env.smoke' }
$linea = Get-Content $envFile | Where-Object { $_ -match '^SYNC_CERT_KEY=' } | Select-Object -First 1
if (!$linea) { throw 'SYNC_CERT_KEY no esta definida en deploy\sync\.env.smoke' }
$certKey = ($linea -split '=',2)[1].Trim()
$headers = @{ 'x-sigr-cert-key' = $certKey }

function PostJson($url, $body) {
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8)
}
function GetJson($url) {
  Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}
function NewUuid { [guid]::NewGuid().ToString() }

$edgeEvent = NewUuid
$edgeError = NewUuid
$cloudEvent = NewUuid
$cloudError = NewUuid

Write-Host '[1/8] Creando colision controlada + error de aplicacion en EDGE...'
$rEdge = PostJson "$edge/sync/internal/certification/conflicts/create" @{ eventId=$edgeEvent; errorEventId=$edgeError }
if ($rEdge.primero.status -ne 'APPLIED') { throw "Primer evento EDGE no fue APPLIED: $($rEdge.primero.status)" }
if ($rEdge.colision.status -ne 'CONFLICT') { throw "Colision EDGE no fue detectada: $($rEdge.colision.status)" }
if ($rEdge.errorAplicacion.status -ne 'ERROR') { throw "Error controlado EDGE no quedo ERROR: $($rEdge.errorAplicacion.status)" }

Write-Host '[2/8] Verificando trazabilidad persistida en EDGE...'
$sEdge = GetJson "$edge/sync/internal/certification/conflicts/status?eventId=$edgeEvent&errorEventId=$edgeError"
if ($sEdge.inboxPrincipal.estado -ne 'APLICADO') { throw 'Inbox principal EDGE no esta APLICADO.' }
if ($sEdge.inboxError.estado -ne 'ERROR') { throw 'Inbox de error EDGE no esta ERROR.' }
$cEdgeCollision = @($sEdge.conflictos | Where-Object { $_.eventId -eq $edgeEvent -and $_.tipo -eq 'COLISION_EVENT_ID' })
$cEdgeApply = @($sEdge.conflictos | Where-Object { $_.eventId -eq $edgeError -and $_.tipo -eq 'APLICACION_EVENTO' })
if ($cEdgeCollision.Count -ne 1) { throw 'Conflicto de colision EDGE falta o esta duplicado.' }
if ($cEdgeApply.Count -ne 1) { throw 'Conflicto de aplicacion EDGE falta o esta duplicado.' }
if ($cEdgeCollision[0].nodoOrigenId -ne 'cert-48d2h-source') { throw 'Origen EDGE no quedo trazado.' }

Write-Host '[3/8] Repitiendo la colision EDGE para probar idempotencia del registro de conflicto...'
$rEdge2 = PostJson "$edge/sync/internal/certification/conflicts/create" @{ eventId=$edgeEvent; errorEventId=$edgeError }
if ($rEdge2.colision.status -ne 'CONFLICT') { throw 'Repeticion EDGE no mantuvo CONFLICT.' }
$sEdge2 = GetJson "$edge/sync/internal/certification/conflicts/status?eventId=$edgeEvent&errorEventId=$edgeError"
if (@($sEdge2.conflictos | Where-Object { $_.eventId -eq $edgeEvent -and $_.tipo -eq 'COLISION_EVENT_ID' }).Count -ne 1) { throw 'La colision EDGE se duplico en la cola.' }
if (@($sEdge2.conflictos | Where-Object { $_.eventId -eq $edgeError -and $_.tipo -eq 'APLICACION_EVENTO' }).Count -ne 1) { throw 'El error EDGE se duplico en la cola.' }

Write-Host '[4/8] Resolviendo explicitamente el conflicto de colision EDGE...'
PostJson "$edge/sync/internal/certification/conflicts/resolve" @{ conflictoId=$cEdgeCollision[0].conflictoId } | Out-Null
$sEdge3 = GetJson "$edge/sync/internal/certification/conflicts/status?eventId=$edgeEvent&errorEventId=$edgeError"
$resolved = @($sEdge3.conflictos | Where-Object { $_.conflictoId -eq $cEdgeCollision[0].conflictoId })
if ($resolved.Count -ne 1 -or $resolved[0].estado -ne 'RESUELTO') { throw 'El conflicto EDGE no quedo RESUELTO.' }

Write-Host '[5/8] Ejecutando la misma prueba de conflicto en CLOUD...'
$rCloud = PostJson "$cloud/sync/internal/certification/conflicts/create" @{ eventId=$cloudEvent; errorEventId=$cloudError }
if ($rCloud.primero.status -ne 'APPLIED' -or $rCloud.colision.status -ne 'CONFLICT' -or $rCloud.errorAplicacion.status -ne 'ERROR') { throw 'CLOUD no produjo APPLIED/CONFLICT/ERROR esperados.' }

Write-Host '[6/8] Verificando trazabilidad persistida en CLOUD...'
$sCloud = GetJson "$cloud/sync/internal/certification/conflicts/status?eventId=$cloudEvent&errorEventId=$cloudError"
$cCloudCollision = @($sCloud.conflictos | Where-Object { $_.eventId -eq $cloudEvent -and $_.tipo -eq 'COLISION_EVENT_ID' })
$cCloudApply = @($sCloud.conflictos | Where-Object { $_.eventId -eq $cloudError -and $_.tipo -eq 'APLICACION_EVENTO' })
if ($cCloudCollision.Count -ne 1 -or $cCloudApply.Count -ne 1) { throw 'Conflictos CLOUD incompletos o duplicados.' }
if ($cCloudCollision[0].nodoDestinoId -ne $sCloud.nodeId) { throw 'Destino CLOUD no quedo trazado.' }

Write-Host '[7/8] Resolviendo conflicto CLOUD y verificando que el error independiente siga abierto...'
PostJson "$cloud/sync/internal/certification/conflicts/resolve" @{ conflictoId=$cCloudCollision[0].conflictoId } | Out-Null
$sCloud2 = GetJson "$cloud/sync/internal/certification/conflicts/status?eventId=$cloudEvent&errorEventId=$cloudError"
$cloudResolved = @($sCloud2.conflictos | Where-Object { $_.conflictoId -eq $cCloudCollision[0].conflictoId })
$cloudErrorOpen = @($sCloud2.conflictos | Where-Object { $_.eventId -eq $cloudError -and $_.tipo -eq 'APLICACION_EVENTO' })
if ($cloudResolved[0].estado -ne 'RESUELTO') { throw 'Conflicto CLOUD no quedo RESUELTO.' }
if ($cloudErrorOpen[0].estado -ne 'ABIERTO') { throw 'El error independiente CLOUD no debe cerrarse por resolver otra colision.' }

Write-Host '[8/8] Certificacion final de cola, trazabilidad y resolucion...'
Write-Host ''
Write-Host 'SIGR SYNC 48D-2H OK'
Write-Host "EDGE conflicto:  $($cEdgeCollision[0].conflictoId)"
Write-Host "CLOUD conflicto: $($cCloudCollision[0].conflictoId)"
Write-Host 'Colisiones eventId, errores de aplicacion, origen/destino, cola idempotente y resolucion administrativa certificados.'
