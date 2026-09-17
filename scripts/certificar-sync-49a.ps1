$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$syncEnv = Join-Path $root 'deploy\sync\.env.smoke'
if (-not (Test-Path $syncEnv)) { throw 'Falta deploy\sync\.env.smoke.' }

function Read-EnvValue([string]$file, [string]$name) {
  $line = Get-Content $file | Where-Object { $_ -match "^$([regex]::Escape($name))=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -split '=', 2)[1].Trim()
}

$certKey = Read-EnvValue $syncEnv 'SYNC_CERT_KEY'
if (-not $certKey) { throw 'No se encontro SYNC_CERT_KEY en deploy\sync\.env.smoke.' }

$edge = 'http://localhost:8080/api'
$cloud = 'http://localhost:8081/api'
$cloudGateway = 'sigr-cloud-smoke-gateway-1'
$certHeaders = @{ 'x-sigr-cert-key' = $certKey }

function PostJson([string]$url, $body, $headers = $null) {
  $params = @{
    Method = 'Post'
    Uri = $url
    ContentType = 'application/json'
    Body = ($body | ConvertTo-Json -Depth 30 -Compress)
    TimeoutSec = 25
  }
  if ($headers) { $params.Headers = $headers }
  Invoke-RestMethod @params
}

function GetJson([string]$url, $headers = $null) {
  $params = @{ Method = 'Get'; Uri = $url; TimeoutSec = 25 }
  if ($headers) { $params.Headers = $headers }
  Invoke-RestMethod @params
}

function GetOperationalStatus([string]$base) {
  GetJson "$base/sync/internal/certification/operational-status" $certHeaders
}

function Assert-ProductionEndpointProtected([string]$base) {
  try {
    Invoke-RestMethod -Method Get -Uri "$base/sync/estado" -TimeoutSec 10 | Out-Null
    throw 'El endpoint productivo /sync/estado respondio sin JWT.'
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { return }
    if ($_.Exception.Message -eq 'El endpoint productivo /sync/estado respondio sin JWT.') { throw }
    throw "No se pudo validar la proteccion JWT de /sync/estado: $($_.Exception.Message)"
  }
}

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

function ActiveOutbox($state) {
  return [int]$state.outbox.pending + [int]$state.outbox.sending + [int]$state.outbox.error
}

function Assert-NoSensitiveFields($state) {
  $json = $state | ConvertTo-Json -Depth 20 -Compress
  foreach ($forbidden in @('payloadHash', 'payload', 'syncPeerKey', 'SYNC_CERT_KEY', 'ultimoError')) {
    if ($json -match [regex]::Escape($forbidden)) {
      throw "El diagnostico expone un campo no permitido: $forbidden"
    }
  }
}

function Test-Ready([string]$url) {
  try {
    $response = Invoke-WebRequest -Method Get -Uri $url -UseBasicParsing -TimeoutSec 4
    return ([int]$response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Wait-Ready([string]$url, [string]$name, [int]$seconds = 90) {
  $limit = (Get-Date).AddSeconds($seconds)
  do {
    if (Test-Ready $url) { return }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $limit)
  throw "$name no quedo disponible en $url dentro del tiempo esperado."
}

function Ensure-SyncSmokeTopology {
  $edgeReady = Test-Ready "$edge/health/ready"
  $cloudReady = Test-Ready "$cloud/health/ready"
  if ($edgeReady -and $cloudReady) { return }

  Write-Host 'La topologia EDGE/CLOUD de certificacion no esta activa o fue reemplazada por otro compose.' -ForegroundColor Yellow
  Write-Host 'Restaurando la topologia hibrida certificada mediante scripts/sigr-sync-smoke-up.ps1...'
  $upScript = Join-Path $root 'scripts\sigr-sync-smoke-up.ps1'
  if (-not (Test-Path $upScript)) { throw 'Falta scripts/sigr-sync-smoke-up.ps1.' }

  & powershell -ExecutionPolicy Bypass -File $upScript
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible restaurar la topologia Sync Smoke.' }

  Wait-Ready "$edge/health/ready" 'EDGE'
  Wait-Ready "$cloud/health/ready" 'CLOUD'
}

$gatewayStopped = $false
try {
  Ensure-SyncSmokeTopology
  Write-Host '[1/8] Validando proteccion JWT y leyendo diagnostico operativo inicial...'
  Assert-ProductionEndpointProtected $edge
  Assert-ProductionEndpointProtected $cloud
  $edgeBase = GetOperationalStatus $edge
  $cloudBase = GetOperationalStatus $cloud
  Assert-NoSensitiveFields $edgeBase
  Assert-NoSensitiveFields $cloudBase
  if ($edgeBase.node.role -ne 'EDGE') { throw "El nodo local no reporta rol EDGE: $($edgeBase.node.role)" }
  if ($cloudBase.node.role -ne 'CLOUD') { throw "El nodo remoto no reporta rol CLOUD: $($cloudBase.node.role)" }

  Write-Host '[2/8] Preparando flujo de prueba aislado...'
  $ids = [ordered]@{
    restauranteGlobalId = [guid]::NewGuid().ToString()
    sucursalGlobalId = [guid]::NewGuid().ToString()
    categoriaGlobalId = [guid]::NewGuid().ToString()
    productoGlobalId = [guid]::NewGuid().ToString()
    estacionGlobalId = [guid]::NewGuid().ToString()
  }
  PostJson "$edge/sync/internal/certification/business/setup" $ids $certHeaders | Out-Null
  PostJson "$cloud/sync/internal/certification/business/setup" $ids $certHeaders | Out-Null
  $baselineActive = ActiveOutbox $edgeBase
  $baselineLast = $edgeBase.outbox.lastSynchronizedAt

  Write-Host '[3/8] Cortando Cloud y comprobando diagnostico EDGE sin dependencia del peer...'
  docker stop $cloudGateway | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible detener temporalmente el gateway Cloud.' }
  $gatewayStopped = $true
  Start-Sleep -Seconds 1
  $offline = GetOperationalStatus $edge
  if ($offline.peer.reachable -ne $false) { throw 'EDGE no reporto peer.reachable=false durante la caida.' }
  if ($offline.status -ne 'OFFLINE') { throw "EDGE no reporto estado OFFLINE. Estado=$($offline.status)" }

  Write-Host '[4/8] Generando actividad offline y verificando Outbox visible...'
  PostJson "$edge/sync/internal/certification/business/create-edge-flow" $ids $certHeaders | Out-Null
  Start-Sleep -Milliseconds 1400
  $queued = GetOperationalStatus $edge
  if ((ActiveOutbox $queued) -le $baselineActive) {
    throw "El diagnostico no reflejo crecimiento de Outbox. Base=$baselineActive Ahora=$(ActiveOutbox $queued)"
  }

  Write-Host '[5/8] Recuperando Cloud y esperando convergencia...'
  docker start $cloudGateway | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible recuperar el gateway Cloud.' }
  $gatewayStopped = $false
  Wait-Cloud
  $recovered = $null
  for ($i = 0; $i -lt 50; $i++) {
    PostJson "$edge/sync/internal/certification/cycle" @{} $certHeaders | Out-Null
    Start-Sleep -Milliseconds 500
    $recovered = GetOperationalStatus $edge
    if ($recovered.peer.reachable -eq $true -and (ActiveOutbox $recovered) -le $baselineActive) { break }
  }
  if (-not $recovered -or $recovered.peer.reachable -ne $true) { throw 'EDGE no volvio a reportar Cloud disponible.' }
  if ((ActiveOutbox $recovered) -gt $baselineActive) { throw 'Outbox del flujo 49A no dreno despues de recuperar Cloud.' }
  if (-not $recovered.outbox.lastSynchronizedAt) { throw 'No se registro ultima sincronizacion exitosa.' }
  if ($baselineLast -and ([datetime]$recovered.outbox.lastSynchronizedAt -le [datetime]$baselineLast)) {
    throw 'La marca de ultima sincronizacion no avanzo.'
  }

  Write-Host '[6/8] Creando conflictos controlados y comprobando contador administrativo...'
  $eventId = [guid]::NewGuid().ToString()
  $errorEventId = [guid]::NewGuid().ToString()
  $beforeConflicts = [int]$recovered.conflicts.open
  PostJson "$edge/sync/internal/certification/conflicts/create" @{ eventId = $eventId; errorEventId = $errorEventId } $certHeaders | Out-Null
  $withConflict = GetOperationalStatus $edge
  if ([int]$withConflict.conflicts.open -le $beforeConflicts) {
    throw "El contador de conflictos abiertos no aumento. Antes=$beforeConflicts Ahora=$($withConflict.conflicts.open)"
  }

  Write-Host '[7/8] Resolviendo los conflictos de certificacion para no dejar residuos abiertos...'
  $conflictStatus = GetJson "$edge/sync/internal/certification/conflicts/status?eventId=$eventId&errorEventId=$errorEventId" $certHeaders
  foreach ($conflict in @($conflictStatus.conflictos)) {
    if ($conflict.estado -eq 'ABIERTO') {
      PostJson "$edge/sync/internal/certification/conflicts/resolve" @{ conflictoId = $conflict.conflictoId } $certHeaders | Out-Null
    }
  }

  Write-Host '[8/8] Validando contrato final y ausencia de secretos...'
  $final = GetOperationalStatus $edge
  Assert-NoSensitiveFields $final
  if ($null -eq $final.outbox.pending -or $null -eq $final.inbox.error -or $null -eq $final.conflicts.open) {
    throw 'El contrato de diagnostico operativo esta incompleto.'
  }

  Write-Host ''
  Write-Host 'SIGR SYNC 49A DIAGNOSTICO OPERATIVO OK' -ForegroundColor Green
  Write-Host "Nodo: $($final.node.id) ($($final.node.role))"
  Write-Host "Peer disponible: $($final.peer.reachable)"
  Write-Host "Outbox: pendientes=$($final.outbox.pending) enviando=$($final.outbox.sending) error=$($final.outbox.error)"
  Write-Host "Inbox error: $($final.inbox.error)"
  Write-Host "Conflictos abiertos finales: $($final.conflicts.open)"
  Write-Host 'Caida de Cloud, visibilidad de cola, recuperacion, ultimo sync, conflictos y contrato seguro certificados.'
}
finally {
  if ($gatewayStopped) {
    Write-Host ''
    Write-Host 'Restaurando gateway Cloud despues de la certificacion...'
    docker start $cloudGateway | Out-Null
  }
}
