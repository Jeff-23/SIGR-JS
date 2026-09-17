Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$target = Join-Path $repo 'deploy\node\.env'
if (Test-Path -LiteralPath $target) {
  Write-Host "La configuración ya existe: $target"
  exit 0
}

function Read-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

function New-Secret([int]$Bytes = 48) {
  $buffer = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return [Convert]::ToBase64String($buffer)
}

$rootEnv = Join-Path $repo '.env'
$backendEnv = Join-Path $repo 'backend\.env'
$user = Read-EnvValue $rootEnv 'POSTGRES_USER'
if (-not $user) { $user = 'admin_sigr' }
$password = Read-EnvValue $rootEnv 'POSTGRES_PASSWORD'
if (-not $password) { $password = New-Secret 24 }
$db = Read-EnvValue $rootEnv 'POSTGRES_DB'
if (-not $db) { $db = 'sigr_db' }
$jwt = Read-EnvValue $backendEnv 'JWT_SECRET'
if (-not $jwt -or $jwt.Length -lt 32 -or $jwt -match '^(secret|changeme|cambiar|password|123456)') { $jwt = New-Secret 48 }

$lines = @(
  "POSTGRES_USER=$user",
  "POSTGRES_PASSWORD=$password",
  "POSTGRES_DB=$db",
  'POSTGRES_PORT=5433',
  "JWT_SECRET=$jwt",
  'JWT_EXPIRES_IN=12h',
  'CORS_ORIGINS=https://sigr.local',
  'TIME_ZONE=America/Bogota',
  'THROTTLE_TTL_MS=60000',
  'THROTTLE_LIMIT=300',
  'METRICS_ENABLED=true',
  'NODE_HTTP_PORT=8080'
)
New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
$lines | Set-Content -LiteralPath $target -Encoding utf8
Write-Host 'CONFIGURACIÓN SIGR NODE CREADA' -ForegroundColor Green
Write-Host "Archivo: $target"
Write-Host 'No lo subas a Git: contiene secretos locales.'
