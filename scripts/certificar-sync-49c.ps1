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

function DeleteJson([string]$url, $headers = $null) {
  $params = @{ Method = 'Delete'; Uri = $url; TimeoutSec = 25 }
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

function Test-ProtectedPostRouteRegistered([string]$url) {
  try {
    Invoke-RestMethod -Method Post -Uri $url -ContentType 'application/json' -Body '{}' -TimeoutSec 8 | Out-Null
    return $true
  } catch {
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      if ($status -eq 401 -or $status -eq 403 -or $status -eq 400) { return $true }
      if ($status -eq 404) { return $false }
    }
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
  if (-not ((Test-Ready "$edge/health/ready") -and (Test-Ready "$cloud/health/ready"))) {
    Start-SyncSmokeTopology 'Restaurando topologia EDGE/CLOUD de certificacion...'
  }

  if (-not (Test-ProtectedPostRouteRegistered "$edge/sync/diagnostico/outbox/sanear-transitorios")) {
    Start-SyncSmokeTopology 'La topologia no contiene las rutas 49C. Reconstruyendo EDGE/CLOUD con el codigo actual...'
  }

  if (-not (Test-ProtectedPostRouteRegistered "$edge/sync/diagnostico/outbox/sanear-transitorios")) {
    throw 'EDGE sigue sin exponer las rutas 49C despues de reconstruir la topologia.'
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

function Assert-NoSensitiveFields($value) {
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

function Wait-OutboxSynchronized([string]$eventId) {
  $status = $null
  for ($i = 0; $i -lt 40; $i++) {
    PostJson "$edge/sync/internal/certification/cycle" @{} $certHeaders | Out-Null
    Start-Sleep -Milliseconds 500
    $status = Get-EventStatus $eventId
    if ($status.outbox.estado -eq 'SINCRONIZADO') { return $status }
    if ($status.outbox.estado -eq 'ERROR') {
      $diag = Get-OutboxDiagnostics
      $row = @($diag.items) | Where-Object { $_.eventId -eq $eventId } | Select-Object -First 1
      $detalle = if ($row -and $row.ultimoError) { [string]$row.ultimoError } else { 'sin detalle disponible' }
      throw "El evento saneado volvio a ERROR. ultimoError=$detalle"
    }
  }
  throw "El evento $eventId no convergio a SINCRONIZADO."
}

$inboxRecoverableId = $null
$inboxUnsupportedId = $null
try {
  Ensure-SyncSmokeTopology

  Write-Host '[1/8] Validando seguridad de las nuevas acciones 49C...'
  Assert-Protected 'POST' "$edge/sync/diagnostico/outbox/sanear-transitorios" @{ confirmar = $true; limite = 1 }
  Assert-Protected 'POST' "$edge/sync/diagnostico/inbox/00000000-0000-4000-8000-000000000000/reintentar" @{ confirmar = $true }

  Write-Host '[2/8] Leyendo diagnostico base y comprobando contrato seguro...'
  $beforeOutbox = Get-OutboxDiagnostics
  $beforeInbox = Get-InboxDiagnostics
  Assert-NoSensitiveFields $beforeOutbox
  Assert-NoSensitiveFields $beforeInbox

  Write-Host '[3/8] Sembrando un error Outbox transitorio con el alcance real del peer...'
  $peerScope = GetJson "$cloud/sync/internal/certification/peer-scope" $certHeaders
  $seedBody = @{}
  if ($peerScope.restauranteGlobalId) { $seedBody.restauranteGlobalId = [string]$peerScope.restauranteGlobalId }
  if ($peerScope.sucursalGlobalId) { $seedBody.sucursalGlobalId = [string]$peerScope.sucursalGlobalId }
  $seedOutbox = PostJson "$edge/sync/internal/certification/diagnostics/outbox/seed-transient" $seedBody $certHeaders
  $outboxEventId = [string]$seedOutbox.eventId
  if (-not $outboxEventId) { throw 'No se creo el Outbox transitorio de certificacion 49C.' }

  $withTransient = Get-OutboxDiagnostics
  $outboxRow = @($withTransient.items) | Where-Object { $_.eventId -eq $outboxEventId } | Select-Object -First 1
  if (-not $outboxRow) { throw 'El Outbox transitorio no aparece en el diagnostico.' }
  if ($outboxRow.causa -ne 'TRANSPORTE' -or -not $outboxRow.saneamientoMasivoPermitido) {
    throw "El Outbox transitorio no fue clasificado como saneable. causa=$($outboxRow.causa)"
  }

  Write-Host '[4/8] Ejecutando saneamiento acotado y verificando que no toca rechazos permanentes...'
  $sanitized = PostJson "$edge/sync/internal/certification/diagnostics/outbox/sanitize-transient?limit=25" @{} $certHeaders
  if ($sanitized.reencolados -lt 1) { throw 'El saneamiento no reencolo ningun error transitorio.' }
  if ($outboxEventId -notin @($sanitized.eventIds)) {
    throw 'El evento transitorio de certificacion no fue incluido en el saneamiento.'
  }

  Write-Host '[5/8] Certificando convergencia del Outbox saneado...'
  $edgeStatus = Wait-OutboxSynchronized $outboxEventId
  if ($edgeStatus.outbox.estado -ne 'SINCRONIZADO') { throw 'EDGE no marco el Outbox saneado como SINCRONIZADO.' }
  $cloudStatus = GetJson "$cloud/sync/internal/certification/status?eventId=$outboxEventId" $certHeaders
  if ($cloudStatus.inbox.estado -ne 'APLICADO') { throw "Cloud no aplico el Outbox saneado. Inbox=$($cloudStatus.inbox.estado)" }

  Write-Host '[6/8] Sembrando Inbox recuperable y tipo no soportado para probar reglas de saneamiento...'
  $recoverableSeed = PostJson "$edge/sync/internal/certification/diagnostics/inbox/seed" @{ tipo = 'RECUPERABLE' } $certHeaders
  $unsupportedSeed = PostJson "$edge/sync/internal/certification/diagnostics/inbox/seed" @{ tipo = 'NO_SOPORTADO' } $certHeaders
  $inboxRecoverableId = [string]$recoverableSeed.eventId
  $inboxUnsupportedId = [string]$unsupportedSeed.eventId
  if (-not $inboxRecoverableId -or -not $inboxUnsupportedId) { throw 'No se pudieron crear los Inbox de certificacion.' }

  $inboxDiag = Get-InboxDiagnostics
  $recoverableRow = @($inboxDiag.items) | Where-Object { $_.eventId -eq $inboxRecoverableId } | Select-Object -First 1
  $unsupportedRow = @($inboxDiag.items) | Where-Object { $_.eventId -eq $inboxUnsupportedId } | Select-Object -First 1
  if (-not $recoverableRow -or -not $recoverableRow.reintentoManualPermitido) {
    throw 'El Inbox recuperable no fue habilitado para reaplicacion controlada.'
  }
  if (-not $unsupportedRow -or $unsupportedRow.clasificacion -ne 'NO_SOPORTADO' -or $unsupportedRow.reintentoManualPermitido) {
    throw 'El Inbox no soportado no quedo correctamente bloqueado.'
  }

  Write-Host '[7/8] Reaplicando un Inbox recuperable y rechazando el tipo no soportado...'
  $retryInbox = PostJson "$edge/sync/internal/certification/diagnostics/inbox/$inboxRecoverableId/retry" @{} $certHeaders
  if ($retryInbox.estado -ne 'APLICADO') {
    throw "El Inbox recuperable no termino APLICADO. estado=$($retryInbox.estado) error=$($retryInbox.ultimoError)"
  }
  try {
    PostJson "$edge/sync/internal/certification/diagnostics/inbox/$inboxUnsupportedId/retry" @{} $certHeaders | Out-Null
    throw 'Se permitio reaplicar un Inbox cuyo tipo sigue sin estar soportado.'
  } catch {
    if ($_.Exception.Message -eq 'Se permitio reaplicar un Inbox cuyo tipo sigue sin estar soportado.') { throw }
    if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 400) {
      throw "Se esperaba HTTP 400 para Inbox no soportado: $($_.Exception.Message)"
    }
  }

  Write-Host '[8/8] Limpiando residuos de certificacion Inbox y verificando diagnostico final...'
  DeleteJson "$edge/sync/internal/certification/diagnostics/inbox/$inboxRecoverableId" $certHeaders | Out-Null
  $inboxRecoverableId = $null
  DeleteJson "$edge/sync/internal/certification/diagnostics/inbox/$inboxUnsupportedId" $certHeaders | Out-Null
  $inboxUnsupportedId = $null

  $afterOutbox = Get-OutboxDiagnostics
  $afterInbox = Get-InboxDiagnostics
  Assert-NoSensitiveFields $afterOutbox
  Assert-NoSensitiveFields $afterInbox
  if (@($afterOutbox.items | Where-Object { $_.eventId -eq $outboxEventId }).Count -ne 0) {
    throw 'El Outbox saneado sigue apareciendo como ERROR.'
  }

  Write-Host ''
  Write-Host 'SIGR SYNC 49C SANEAMIENTO OPERATIVO OK' -ForegroundColor Green
  Write-Host "Outbox saneado: $outboxEventId"
  Write-Host "Outbox errores visibles actuales: $($afterOutbox.total)"
  Write-Host "Inbox errores visibles actuales: $($afterInbox.total)"
  Write-Host 'Saneamiento transitorio acotado, reaplicacion Inbox controlada, bloqueo de no soportados y limpieza de residuos certificados.'
}
finally {
  foreach ($eventId in @($inboxRecoverableId, $inboxUnsupportedId)) {
    if ($eventId) {
      try { DeleteJson "$edge/sync/internal/certification/diagnostics/inbox/$eventId" $certHeaders | Out-Null } catch { }
    }
  }
}
