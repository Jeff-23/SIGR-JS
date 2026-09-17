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
  return Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 20 -Compress) -TimeoutSec 15
}
function Get-Json([string]$url, [hashtable]$headers) {
  return Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 15
}

$cfg = Read-EnvFile $syncFile
$certHeaders = @{ 'x-sigr-cert-key' = $cfg.SYNC_CERT_KEY }
$peerHeaders = @{ 'x-sigr-sync-node' = $cfg.EDGE_NODE_ID; 'x-sigr-sync-key' = $cfg.SYNC_PEER_KEY }
$edge = 'http://localhost:8080/api'
$cloud = 'http://localhost:8081/api'

Write-Host '[1/6] Encolando PING EDGE -> CLOUD...'
$edgeCreated = Post-Json "$edge/sync/internal/certification/enqueue" $certHeaders @{ destinationNodeId = $cfg.CLOUD_NODE_ID }
$edgeEvent = $edgeCreated.event

Write-Host '[2/6] Idempotencia Inbox Cloud (mismo eventId dos veces)...'
$first = Post-Json "$cloud/sync/internal/events" $peerHeaders @{ events = @($edgeEvent) }
$second = Post-Json "$cloud/sync/internal/events" $peerHeaders @{ events = @($edgeEvent) }
if ($second.results[0].status -ne 'DUPLICATE') { throw "Inbox no detecto duplicado: $($second.results[0].status)" }

Write-Host '[3/6] Colision protegida: mismo eventId con payload alterado...'
$altered = $edgeEvent | ConvertTo-Json -Depth 20 | ConvertFrom-Json
$altered.payload.nonce = [guid]::NewGuid().ToString()
$conflict = Post-Json "$cloud/sync/internal/events" $peerHeaders @{ events = @($altered) }
if ($conflict.results[0].status -ne 'CONFLICT') { throw "Inbox no rechazo colision: $($conflict.results[0].status)" }

Write-Host '[4/6] Encolando PING CLOUD -> EDGE...'
$cloudCreated = Post-Json "$cloud/sync/internal/certification/enqueue" $certHeaders @{ destinationNodeId = $cfg.EDGE_NODE_ID }
$cloudEvent = $cloudCreated.event

Write-Host '[5/6] Ejecutando ciclo EDGE: push + pull + ACK...'
$null = Post-Json "$edge/sync/internal/certification/cycle" $certHeaders @{}
Start-Sleep -Milliseconds 800
$null = Post-Json "$edge/sync/internal/certification/cycle" $certHeaders @{}

Write-Host '[6/6] Verificando estados finales...'
$edgeA = Get-Json "$edge/sync/internal/certification/status?eventId=$($edgeEvent.eventId)" $certHeaders
$cloudA = Get-Json "$cloud/sync/internal/certification/status?eventId=$($edgeEvent.eventId)" $certHeaders
$edgeB = Get-Json "$edge/sync/internal/certification/status?eventId=$($cloudEvent.eventId)" $certHeaders
$cloudB = Get-Json "$cloud/sync/internal/certification/status?eventId=$($cloudEvent.eventId)" $certHeaders

if ($edgeA.outbox.estado -ne 'SINCRONIZADO') { throw 'EDGE outbox no quedo SINCRONIZADO.' }
if ($cloudA.inbox.estado -ne 'APLICADO') { throw 'Cloud inbox no aplico evento EDGE.' }
if ($cloudB.outbox.estado -ne 'SINCRONIZADO') { throw 'Cloud outbox no recibio ACK de EDGE.' }
if ($edgeB.inbox.estado -ne 'APLICADO') { throw 'EDGE inbox no aplico evento Cloud.' }

Write-Host ''
Write-Host 'SIGR SYNC 48D-1 OK'
Write-Host "EDGE -> CLOUD: $($edgeEvent.eventId)"
Write-Host "CLOUD -> EDGE: $($cloudEvent.eventId)"
Write-Host 'Idempotencia, colision, outbox, inbox, pull y ACK certificados.'
