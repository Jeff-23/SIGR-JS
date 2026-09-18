[CmdletBinding()]
param(
  [string]$NodeId,
  [ValidateRange(1024, 65535)][int]$HttpPort = 8080,
  [ValidateRange(1024, 65535)][int]$PostgresPort = 5433,
  [string]$TimeZone = 'America/Bogota',
  [switch]$Force,
  [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envDir = Join-Path $repo 'deploy\node'
$envFile = Join-Path $envDir '.env'
$composeFile = Join-Path $repo 'docker-compose.node.yml'

function New-Secret([int]$Bytes = 48) {
  $buffer = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return ([Convert]::ToBase64String($buffer)).TrimEnd('=').Replace('+','-').Replace('/','_')
}

function Read-EnvValue([string]$Name) {
  if (-not (Test-Path -LiteralPath $envFile)) { return $null }
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

function Set-EnvValue([System.Collections.Generic.List[string]]$Lines, [string]$Name, [string]$Value) {
  $pattern = "^\s*$([regex]::Escape($Name))\s*="
  $found = $false
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    if ($Lines[$i] -match $pattern) {
      $Lines[$i] = "$Name=$Value"
      $found = $true
    }
  }
  if (-not $found) { $Lines.Add("$Name=$Value") }
}

function Test-PortInUse([int]$Port) {
  try {
    return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Select-Object -First 1)
  } catch {
    try {
      $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
      $listener.Start(); $listener.Stop(); return $false
    } catch { return $true }
  }
}

function Wait-Http([string]$Url, [int]$Attempts = 60) {
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { return }
    } catch { }
    Start-Sleep -Seconds 2
  }
  throw "No respondio a tiempo: $Url"
}

if (-not (Test-Path -LiteralPath $composeFile)) {
  throw "No se encontro docker-compose.node.yml en $repo"
}

if (-not $NodeId) {
  $computerName = $env:COMPUTERNAME
  if ([string]::IsNullOrWhiteSpace($computerName)) { $computerName = 'restaurante' }
  $hostPart = $computerName.ToLowerInvariant() -replace '[^a-z0-9-]', '-'
  $NodeId = "edge-$hostPart"
}
$NodeId = $NodeId.Trim().ToLowerInvariant()
if ($NodeId -notmatch '^[a-z0-9][a-z0-9._-]{2,119}$') {
  throw 'NodeId invalido. Usa 3-120 caracteres: letras minusculas, numeros, punto, guion o guion bajo.'
}

Write-Host 'SIGR - INSTALACION EDGE LOCAL' -ForegroundColor Cyan
Write-Host "Repositorio : $repo"
Write-Host "NodeId      : $NodeId"
Write-Host ''

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker no esta instalado o no esta disponible en PATH.'
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop/Engine no esta disponible.' }
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 no esta disponible.' }

New-Item -ItemType Directory -Force -Path $envDir | Out-Null

$existing = Test-Path -LiteralPath $envFile
if ($existing) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backup = "$envFile.backup-$stamp"
  Copy-Item -LiteralPath $envFile -Destination $backup -Force
  Write-Host "Configuracion existente detectada. Backup: $backup" -ForegroundColor Yellow
  Write-Host 'Se conservaran credenciales PostgreSQL/JWT y datos existentes.' -ForegroundColor Yellow

  foreach ($required in @('POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_DB','JWT_SECRET')) {
    if ([string]::IsNullOrWhiteSpace((Read-EnvValue $required))) {
      throw "La configuracion existente no contiene $required. No se modifica para evitar romper la base local."
    }
  }

  $currentHttp = Read-EnvValue 'NODE_HTTP_PORT'
  $currentDb = Read-EnvValue 'POSTGRES_PORT'
  $currentTz = Read-EnvValue 'TIME_ZONE'
  if (-not $PSBoundParameters.ContainsKey('HttpPort') -and $currentHttp -match '^\d+$') { $HttpPort = [int]$currentHttp }
  if (-not $PSBoundParameters.ContainsKey('PostgresPort') -and $currentDb -match '^\d+$') { $PostgresPort = [int]$currentDb }
  if (-not $PSBoundParameters.ContainsKey('TimeZone') -and -not [string]::IsNullOrWhiteSpace($currentTz)) { $TimeZone = $currentTz }

  if ($HttpPort -eq $PostgresPort) { throw 'NODE_HTTP_PORT y POSTGRES_PORT no pueden ser iguales.' }

  $lines = New-Object 'System.Collections.Generic.List[string]'
  Get-Content -LiteralPath $envFile | ForEach-Object { [void]$lines.Add($_) }

  Set-EnvValue $lines 'NODE_HTTP_PORT' ([string]$HttpPort)
  Set-EnvValue $lines 'POSTGRES_PORT' ([string]$PostgresPort)
  Set-EnvValue $lines 'TIME_ZONE' $TimeZone
  Set-EnvValue $lines 'SYNC_ENABLED' 'false'
  Set-EnvValue $lines 'SYNC_ROLE' 'EDGE'
  Set-EnvValue $lines 'SYNC_NODE_ID' $NodeId
  Set-EnvValue $lines 'SYNC_PEER_URL' ''
  Set-EnvValue $lines 'SYNC_PEER_NODE_ID' ''
  Set-EnvValue $lines 'SYNC_PEER_KEY' ''
  Set-EnvValue $lines 'SYNC_CERTIFICATION_ENABLED' 'false'
  Set-EnvValue $lines 'SYNC_CERT_KEY' ''
  if ([string]::IsNullOrWhiteSpace((Read-EnvValue 'SYNC_POLL_INTERVAL_MS'))) { Set-EnvValue $lines 'SYNC_POLL_INTERVAL_MS' '5000' }
  if ([string]::IsNullOrWhiteSpace((Read-EnvValue 'SYNC_BATCH_SIZE'))) { Set-EnvValue $lines 'SYNC_BATCH_SIZE' '50' }

  $lines | Set-Content -LiteralPath $envFile -Encoding utf8
  Write-Host 'Configuracion adaptada a modo local-first sin regenerar secretos.' -ForegroundColor Green
} else {
  if (Test-PortInUse $HttpPort) { throw "El puerto $HttpPort ya esta en uso." }
  if (Test-PortInUse $PostgresPort) { throw "El puerto $PostgresPort ya esta en uso." }
  if ($HttpPort -eq $PostgresPort) { throw 'NODE_HTTP_PORT y POSTGRES_PORT no pueden ser iguales.' }

  $postgresUser = 'admin_sigr'
  $postgresPassword = New-Secret 32
  $postgresDb = 'sigr_db'
  $jwtSecret = New-Secret 64

  $lines = @(
    "POSTGRES_USER=$postgresUser",
    "POSTGRES_PASSWORD=$postgresPassword",
    "POSTGRES_DB=$postgresDb",
    "POSTGRES_PORT=$PostgresPort",
    "JWT_SECRET=$jwtSecret",
    'JWT_EXPIRES_IN=12h',
    "CORS_ORIGINS=http://localhost:$HttpPort",
    "TIME_ZONE=$TimeZone",
    'THROTTLE_TTL_MS=60000',
    'THROTTLE_LIMIT=300',
    'METRICS_ENABLED=true',
    "NODE_HTTP_PORT=$HttpPort",
    '',
    '# Sprint 50A: restaurante local-first. Cloud no es requisito operativo.',
    'SYNC_ENABLED=false',
    'SYNC_ROLE=EDGE',
    "SYNC_NODE_ID=$NodeId",
    'SYNC_PEER_URL=',
    'SYNC_PEER_NODE_ID=',
    'SYNC_PEER_KEY=',
    'SYNC_POLL_INTERVAL_MS=5000',
    'SYNC_BATCH_SIZE=50',
    'SYNC_CERTIFICATION_ENABLED=false',
    'SYNC_CERT_KEY='
  )
  $lines | Set-Content -LiteralPath $envFile -Encoding utf8
  Write-Host 'Configuracion local nueva creada. Los secretos no se imprimen.' -ForegroundColor Green
}

Write-Host "Puerto web  : $HttpPort"
Write-Host "Puerto DB   : $PostgresPort (solo localhost)"
Write-Host 'Sync Cloud  : desactivado'
Write-Host ''

New-Item -ItemType Directory -Force -Path (Join-Path $repo 'backend\storage\soportes') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $repo 'backend\storage\media') | Out-Null

Push-Location $repo
try {
  docker compose --env-file $envFile -f docker-compose.node.yml config --quiet
  if ($LASTEXITCODE -ne 0) { throw 'La configuracion Docker de EDGE no es valida.' }

  if (-not $NoStart) {
    docker compose --env-file $envFile -f docker-compose.node.yml up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'No fue posible iniciar SIGR EDGE.' }

    Wait-Http "http://localhost:$HttpPort/node-health" 60
    Wait-Http "http://localhost:$HttpPort/api/health/ready" 60
  }
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'SIGR EDGE LOCAL INSTALADO' -ForegroundColor Green
Write-Host "Acceso local: http://localhost:$HttpPort"
try {
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress -Unique
  foreach ($ip in $ips) { Write-Host "Acceso LAN  : http://${ip}:$HttpPort" }
} catch { }
Write-Host "Configuracion: $envFile"
Write-Host 'PostgreSQL/JWT existentes fueron preservados cuando ya habia una instalacion.'
if ($NoStart) { Write-Host 'No se iniciaron contenedores porque se uso -NoStart.' -ForegroundColor Yellow }
