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
$cloudNode = Read-EnvValue $syncEnv 'CLOUD_NODE_ID'
if (-not $certKey) { throw 'No se encontro SYNC_CERT_KEY en deploy\sync\.env.smoke.' }
if (-not $cloudNode) { throw 'No se encontro CLOUD_NODE_ID en deploy\sync\.env.smoke.' }

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
  $consecutivos = 0
  do {
    if (Test-Ready $url) {
      $consecutivos += 1
      if ($consecutivos -ge 3) { return }
    } else {
      $consecutivos = 0
    }
    Start-Sleep -Milliseconds 700
  } while ((Get-Date) -lt $limit)
  throw "$name no quedo estable en $url dentro del tiempo esperado."
}

function Test-ProtectedRouteRegistered([string]$url) {
  try {
    Invoke-RestMethod -Method Get -Uri $url -TimeoutSec 8 | Out-Null
    return $true
  } catch {
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      # 401/403 significa que la ruta existe y sus guards estan activos.
      if ($status -eq 401 -or $status -eq 403) { return $true }
      if ($status -eq 404) { return $false }
    }
    return $false
  }
}

function Test-CertificationPeerScopeEndpoint {
  try {
    GetJson "$cloud/sync/internal/certification/peer-scope" $certHeaders | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Start-SyncSmokeTopology([string]$reason) {
  Write-Host $reason -ForegroundColor Yellow
  $upScript = Join-Path $root 'scripts\sigr-sync-smoke-up.ps1'
  if (-not (Test-Path $upScript)) { throw 'Falta scripts\sigr-sync-smoke-up.ps1.' }
  & powershell -ExecutionPolicy Bypass -File $upScript
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible construir/restaurar la topologia Sync Smoke.' }
  Wait-Ready "$edge/health/ready" 'EDGE'
  Wait-Ready "$cloud/health/ready" 'CLOUD'
}

function Ensure-SyncSmokeTopology {
  $edgeReady = Test-Ready "$edge/health/ready"
  $cloudReady = Test-Ready "$cloud/health/ready"

  if (-not ($edgeReady -and $cloudReady)) {
    Start-SyncSmokeTopology 'Restaurando topologia EDGE/CLOUD de certificacion...'
  }

  # Un contenedor saludable puede seguir ejecutando la imagen del sprint anterior.
  # 49B necesita comprobar que su ruta nueva esta realmente montada antes de certificar.
  if (-not (Test-ProtectedRouteRegistered "$edge/sync/diagnostico/outbox")) {
    Start-SyncSmokeTopology 'La topologia esta saludable pero no contiene las rutas 49B. Reconstruyendo EDGE/CLOUD con el codigo actual...'
  }

  if (-not (Test-ProtectedRouteRegistered "$edge/sync/diagnostico/outbox")) {
    throw 'EDGE sigue sin exponer /sync/diagnostico/outbox despues de reconstruir la topologia.'
  }

  # 49B v4 necesita conocer el alcance real con el que Cloud autentica al EDGE.
  # Un peer puede haber quedado ligado a restaurante/sucursal por certificaciones
  # anteriores; un PING sin ese envelope seria rechazado aunque el transporte este sano.
  if (-not (Test-CertificationPeerScopeEndpoint)) {
    Start-SyncSmokeTopology 'La topologia no contiene el soporte de alcance para 49B. Reconstruyendo EDGE/CLOUD con el codigo actual...'
  }
  if (-not (Test-CertificationPeerScopeEndpoint)) {
    throw 'Cloud sigue sin exponer el alcance de certificacion del peer despues de reconstruir la topologia.'
  }
}

function Assert-Protected([string]$method, [string]$url, $body = $null) {
  try {
    if ($method -eq 'POST') {
      $safeBody = if ($null -eq $body) { @{} } else { $body }
      Invoke-RestMethod -Method Post -Uri $url -ContentType 'application/json' -Body ($safeBody | ConvertTo-Json -Compress) -TimeoutSec 10 | Out-Null
    } else {
      Invoke-RestMethod -Method Get -Uri $url -TimeoutSec 10 | Out-Null
    }
    throw "El endpoint productivo respondio sin JWT: $method $url"
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { return }
    if ($_.Exception.Message -like 'El endpoint productivo respondio sin JWT:*') { throw }
    throw "No se pudo validar proteccion JWT de $url`: $($_.Exception.Message)"
  }
}

function Assert-NoPayload($value) {
  $json = $value | ConvertTo-Json -Depth 30 -Compress
  foreach ($forbidden in @('"payload"', 'payloadHash', 'syncPeerKey', 'SYNC_CERT_KEY')) {
    if ($json -match [regex]::Escape($forbidden)) {
      throw "El diagnostico expone un campo no permitido: $forbidden"
    }
  }
}

function Get-OutboxDiagnostics {
  GetJson "$edge/sync/internal/certification/diagnostics/outbox" $certHeaders
}

function Get-InboxDiagnostics {
  GetJson "$edge/sync/internal/certification/diagnostics/inbox" $certHeaders
}

function Get-EventStatus([string]$eventId) {
  GetJson "$edge/sync/internal/certification/status?eventId=$eventId" $certHeaders
}

$gatewayStopped = $false
$eventId = $null
try {
  Ensure-SyncSmokeTopology

  Write-Host '[1/8] Validando seguridad de endpoints administrativos...'
  Assert-Protected 'GET' "$edge/sync/diagnostico/outbox"
  Assert-Protected 'GET' "$edge/sync/diagnostico/inbox"
  Assert-Protected 'POST' "$edge/sync/diagnostico/outbox/00000000-0000-4000-8000-000000000000/reintentar" @{ confirmar = $true }

  Write-Host '[2/8] Leyendo diagnostico actual sin payloads ni hashes...'
  $beforeOutbox = Get-OutboxDiagnostics
  $beforeInbox = Get-InboxDiagnostics
  Assert-NoPayload $beforeOutbox
  Assert-NoPayload $beforeInbox
  if ($null -eq $beforeOutbox.total -or $null -eq $beforeInbox.total) {
    throw 'El contrato de diagnostico no contiene total.'
  }

  Write-Host '[3/8] Creando un error Outbox aislado con Cloud temporalmente fuera de linea...'
  # Leer el alcance ANTES de cortar Cloud. El receptor valida el envelope contra
  # el restaurante/sucursal asociados al peer autenticado. Las certificaciones
  # 48D de negocio pueden haber dejado ese peer correctamente acotado.
  $peerScope = GetJson "$cloud/sync/internal/certification/peer-scope" $certHeaders

  # El endpoint Cloud devuelve el modelo SyncPeer seleccionado, cuyo identificador
  # se llama `nodeId`. La version v4 del certificador esperaba por error una
  # propiedad `peerNodeId`, por eso leia una cadena vacia aunque Cloud hubiera
  # encontrado correctamente el peer. Conservamos fallback por compatibilidad.
  $reportedPeerNodeId = [string]$peerScope.nodeId
  if (-not $reportedPeerNodeId) { $reportedPeerNodeId = [string]$peerScope.peerNodeId }
  if (-not $reportedPeerNodeId) {
    throw 'Cloud devolvio el alcance del peer sin nodeId.'
  }

  $expectedEdgeNodeId = Read-EnvValue $syncEnv 'EDGE_NODE_ID'
  if ($expectedEdgeNodeId -and $reportedPeerNodeId -ne [string]$expectedEdgeNodeId) {
    throw "Cloud reporta un peer de certificacion inesperado: $reportedPeerNodeId (esperado: $expectedEdgeNodeId)"
  }

  $enqueueBody = @{ destinationNodeId = $cloudNode }
  if ($peerScope.restauranteGlobalId) {
    $enqueueBody.restauranteGlobalId = [string]$peerScope.restauranteGlobalId
  }
  if ($peerScope.sucursalGlobalId) {
    $enqueueBody.sucursalGlobalId = [string]$peerScope.sucursalGlobalId
  }

  docker stop $cloudGateway | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible detener temporalmente el gateway Cloud.' }
  $gatewayStopped = $true
  $queued = PostJson "$edge/sync/internal/certification/enqueue" $enqueueBody $certHeaders
  $eventId = [string]$queued.event.eventId
  if (-not $eventId) { throw 'No se obtuvo eventId del evento de certificacion.' }
  PostJson "$edge/sync/internal/certification/cycle" @{} $certHeaders | Out-Null
  Start-Sleep -Milliseconds 700

  Write-Host '[4/8] Verificando clasificacion y detalle seguro del error...'
  $withError = Get-OutboxDiagnostics
  Assert-NoPayload $withError
  $row = @($withError.items) | Where-Object { $_.eventId -eq $eventId } | Select-Object -First 1
  if (-not $row) { throw "El evento $eventId no aparece en diagnostico Outbox ERROR." }
  if (-not $row.reintentoManualPermitido) { throw 'El error recuperable no fue marcado como reintentable.' }
  if ($row.clasificacion -notin @('REINTENTABLE', 'EN_ESPERA')) {
    throw "Clasificacion inesperada para error recuperable: $($row.clasificacion)"
  }
  if (-not $row.ultimoError) { throw 'El diagnostico no conserva la causa resumida del error.' }

  Write-Host '[5/8] Recuperando Cloud de forma estable y ejecutando un unico reintento manual...'
  docker start $cloudGateway | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible recuperar el gateway Cloud.' }
  $gatewayStopped = $false
  Wait-Ready "$cloud/health/ready" 'CLOUD'

  # El reintento debe ocurrir DESPUES de recuperar la dependencia. Reencolarlo
  # mientras Cloud sigue caido permite que el ciclo automatico EDGE lo tome y
  # lo devuelva a ERROR antes de que el gateway vuelva a estar listo.
  $retry = PostJson "$edge/sync/internal/certification/diagnostics/outbox/$eventId/retry" @{} $certHeaders
  if ($retry.estado -ne 'PENDIENTE') { throw "El reintento no reencolo el evento. Estado=$($retry.estado)" }

  Write-Host '[6/8] Esperando convergencia e idempotencia despues del reintento unitario...'
  $finalStatus = $null
  for ($i = 0; $i -lt 40; $i++) {
    PostJson "$edge/sync/internal/certification/cycle" @{} $certHeaders | Out-Null
    Start-Sleep -Milliseconds 600
    $finalStatus = Get-EventStatus $eventId
    if ($finalStatus.outbox.estado -eq 'SINCRONIZADO') { break }
    if ($finalStatus.outbox.estado -eq 'ERROR') {
      $diag = Get-OutboxDiagnostics
      $diagRow = @($diag.items) | Where-Object { $_.eventId -eq $eventId } | Select-Object -First 1
      $detalle = if ($diagRow -and $diagRow.ultimoError) { [string]$diagRow.ultimoError } else { 'sin detalle disponible' }
      throw "El unico reintento volvio a ERROR despues de recuperar Cloud. ultimoError=$detalle"
    }
  }
  if (-not $finalStatus -or $finalStatus.outbox.estado -ne 'SINCRONIZADO') {
    $diag = Get-OutboxDiagnostics
    $diagRow = @($diag.items) | Where-Object { $_.eventId -eq $eventId } | Select-Object -First 1
    $detalle = if ($diagRow -and $diagRow.ultimoError) { [string]$diagRow.ultimoError } else { 'sin detalle disponible' }
    throw "El evento reintentado no convergio. Estado=$($finalStatus.outbox.estado) ultimoError=$detalle"
  }
  $cloudStatus = GetJson "$cloud/sync/internal/certification/status?eventId=$eventId" $certHeaders
  if ($cloudStatus.inbox.estado -ne 'APLICADO') {
    throw "Cloud no aplico el evento reintentado. Inbox=$($cloudStatus.inbox.estado)"
  }

  Write-Host '[7/8] Confirmando que no se permite reintentar un evento ya sincronizado...'
  try {
    PostJson "$edge/sync/internal/certification/diagnostics/outbox/$eventId/retry" @{} $certHeaders | Out-Null
    throw 'Se permitio reintentar un evento ya SINCRONIZADO.'
  } catch {
    if ($_.Exception.Message -eq 'Se permitio reintentar un evento ya SINCRONIZADO.') { throw }
    if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 400) {
      throw "Se esperaba HTTP 400 al repetir el reintento: $($_.Exception.Message)"
    }
  }

  Write-Host '[8/8] Validando limpieza del error de prueba y lectura Inbox de solo diagnostico...'
  $afterOutbox = Get-OutboxDiagnostics
  $afterInbox = Get-InboxDiagnostics
  Assert-NoPayload $afterOutbox
  Assert-NoPayload $afterInbox
  if (@($afterOutbox.items | Where-Object { $_.eventId -eq $eventId }).Count -ne 0) {
    throw 'El evento sincronizado sigue apareciendo como Outbox ERROR.'
  }

  Write-Host ''
  Write-Host 'SIGR SYNC 49B RECUPERACION CONTROLADA OK' -ForegroundColor Green
  Write-Host "Evento certificado: $eventId"
  Write-Host "Outbox errores visibles actuales: $($afterOutbox.total)"
  Write-Host "Inbox errores visibles actuales: $($afterInbox.total)"
  Write-Host 'Listado seguro, clasificacion, reintento unitario, convergencia e idempotencia certificados.'
}
finally {
  if ($gatewayStopped) {
    Write-Host ''
    Write-Host 'Restaurando gateway Cloud despues de la certificacion...'
    docker start $cloudGateway | Out-Null
  }
}
