$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envDir = Join-Path $root 'deploy\cloud'
$envFile = Join-Path $envDir '.env.smoke'

if (Test-Path $envFile) {
  Write-Host "La configuración smoke ya existe: $envFile"
  exit 0
}

function New-RandomSecret([int]$bytes = 32) {
  $buffer = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return [Convert]::ToBase64String($buffer).Replace('+','A').Replace('/','B').Replace('=','')
}

$dbPassword = New-RandomSecret 24
$jwtSecret = New-RandomSecret 48
$content = @"
CLOUD_DOMAIN=localhost
ACME_EMAIL=local@sigr.invalid
CLOUD_HTTP_PORT=80
CLOUD_HTTPS_PORT=443
CLOUD_SMOKE_PORT=8081
POSTGRES_USER=admin_sigr
POSTGRES_PASSWORD=$dbPassword
POSTGRES_DB=sigr_cloud_smoke
JWT_SECRET=$jwtSecret
JWT_EXPIRES_IN=12h
CORS_ORIGINS=http://localhost:8081
TIME_ZONE=America/Bogota
THROTTLE_TTL_MS=60000
THROTTLE_LIMIT=300
METRICS_ENABLED=true
"@
Set-Content -Path $envFile -Value $content -Encoding UTF8
Write-Host "Configuración smoke creada: $envFile"
