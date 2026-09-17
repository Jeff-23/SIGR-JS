$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'deploy\sync'
$file = Join-Path $dir '.env.smoke'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

if (Test-Path $file) {
  Write-Host "La configuracion Sync Smoke ya existe: $file"
  exit 0
}

function New-RandomSecret([int]$bytes = 40) {
  $buffer = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return [Convert]::ToBase64String($buffer).Replace('+','A').Replace('/','B').Replace('=','')
}

$peerKey = New-RandomSecret 48
$certKey = New-RandomSecret 48
$content = @"
EDGE_NODE_ID=edge-dev
CLOUD_NODE_ID=cloud-smoke
SYNC_PEER_KEY=$peerKey
SYNC_CERT_KEY=$certKey
"@
Set-Content -Path $file -Value $content -Encoding UTF8
Write-Host "Configuracion Sync Smoke creada: $file"
