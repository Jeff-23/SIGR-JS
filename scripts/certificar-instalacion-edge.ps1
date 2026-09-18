[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
$composeFile = Join-Path $repo 'docker-compose.node.yml'

function Read-Env([string]$Name) {
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

function Require([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Get-Http([string]$Url) {
  $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
  if ($r.StatusCode -lt 200 -or $r.StatusCode -ge 300) { throw "HTTP $($r.StatusCode) en $Url" }
  return $r
}

Write-Host '[1/7] Validando archivos y secretos locales...'
Require (Test-Path -LiteralPath $envFile) 'Falta deploy/node/.env.'
Require (Test-Path -LiteralPath $composeFile) 'Falta docker-compose.node.yml.'

$httpPort = [int](Read-Env 'NODE_HTTP_PORT')
$dbPort = [int](Read-Env 'POSTGRES_PORT')
$jwt = Read-Env 'JWT_SECRET'
$dbPass = Read-Env 'POSTGRES_PASSWORD'
$nodeId = Read-Env 'SYNC_NODE_ID'
Require ($httpPort -ge 1024 -and $httpPort -le 65535) 'NODE_HTTP_PORT invalido.'
Require ($dbPort -ge 1024 -and $dbPort -le 65535) 'POSTGRES_PORT invalido.'
Require ($jwt -and $jwt.Length -ge 32) 'JWT_SECRET ausente o demasiado corto.'
Require (-not [string]::IsNullOrWhiteSpace($dbPass)) 'POSTGRES_PASSWORD ausente.'
if ($dbPass.Length -lt 24) {
  Write-Warning 'POSTGRES_PASSWORD heredado tiene menos de 24 caracteres. Se acepta en 50A porque esta instalacion preserva una base existente y PostgreSQL queda solo en loopback. Debe rotarse en el bloque de endurecimiento de seguridad sin recrear el volumen.'
}
Require ($nodeId -and $nodeId.Length -ge 3) 'SYNC_NODE_ID ausente.'
Require ((Read-Env 'SYNC_CERTIFICATION_ENABLED') -eq 'false') 'SYNC_CERTIFICATION_ENABLED debe estar desactivado en instalacion real.'
Require ([string]::IsNullOrWhiteSpace((Read-Env 'SYNC_CERT_KEY'))) 'SYNC_CERT_KEY debe quedar vacio fuera de certificacion.'

Write-Host '[2/7] Validando Docker Compose...'
Push-Location $repo
try {
  docker info *> $null
  Require ($LASTEXITCODE -eq 0) 'Docker no esta disponible.'
  docker compose --env-file $envFile -f docker-compose.node.yml config --quiet
  Require ($LASTEXITCODE -eq 0) 'docker-compose.node.yml no valida con deploy/node/.env.'

  Write-Host '[3/7] Validando servicios activos...'
  docker compose --env-file $envFile -f docker-compose.node.yml ps
  Require ($LASTEXITCODE -eq 0) 'No fue posible consultar servicios EDGE.'

  Write-Host '[4/7] Validando frontend y backend por el gateway local...'
  Get-Http "http://localhost:$httpPort/node-health" | Out-Null
  Get-Http "http://localhost:$httpPort/api/health/ready" | Out-Null

  Write-Host '[5/7] Validando PostgreSQL dentro del stack...'
  $dbUser = Read-Env 'POSTGRES_USER'
  $dbName = Read-Env 'POSTGRES_DB'
  docker compose --env-file $envFile -f docker-compose.node.yml exec -T db pg_isready -U $dbUser -d $dbName *> $null
  Require ($LASTEXITCODE -eq 0) 'PostgreSQL no esta listo.'

  Write-Host '[6/7] Validando superficie de red local...'
  # No usamos `docker compose port` para distinguir puerto EXPOSED de puerto
  # realmente publicado: algunas versiones pueden reportar el 3000/tcp interno.
  # Docker inspect refleja la vinculacion real al host.
  $dbContainerId = (docker compose --env-file $envFile -f docker-compose.node.yml ps -q db | Out-String).Trim()
  $backendContainerId = (docker compose --env-file $envFile -f docker-compose.node.yml ps -q backend | Out-String).Trim()
  Require (-not [string]::IsNullOrWhiteSpace($dbContainerId)) 'No se encontro el contenedor PostgreSQL.'
  Require (-not [string]::IsNullOrWhiteSpace($backendContainerId)) 'No se encontro el contenedor backend.'

  $dbInspect = docker inspect $dbContainerId | ConvertFrom-Json
  $backendInspect = docker inspect $backendContainerId | ConvertFrom-Json
  $dbBindings = $dbInspect[0].NetworkSettings.Ports.'5432/tcp'
  $backendBindings = $backendInspect[0].NetworkSettings.Ports.'3000/tcp'

  Require ($null -ne $dbBindings -and $dbBindings.Count -ge 1) 'PostgreSQL debe estar publicado en loopback para soporte local.'
  foreach ($binding in $dbBindings) {
    Require ($binding.HostIp -eq '127.0.0.1') 'PostgreSQL debe estar publicado exclusivamente en 127.0.0.1.'
  }
  Require ($null -eq $backendBindings -or $backendBindings.Count -eq 0) 'El puerto directo del backend no debe publicarse al host.'

  Write-Host '[7/7] Validando continuidad local sin dependencia Cloud...'
  Require ((Read-Env 'SYNC_ROLE') -eq 'EDGE') 'SYNC_ROLE debe ser EDGE.'
  Require ((Read-Env 'SYNC_ENABLED') -eq 'false') 'Sprint 50A certifica instalacion local antes del enrolamiento Cloud; SYNC_ENABLED debe ser false.'
  Get-Http "http://localhost:$httpPort/api/health/ready" | Out-Null
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'SIGR SPRINT 50A INSTALACION EDGE OK' -ForegroundColor Green
Write-Host "Nodo: $nodeId"
Write-Host "Aplicacion: http://localhost:$httpPort"
Write-Host "PostgreSQL: localhost:$dbPort (solo loopback)"
Write-Host 'Docker, migraciones, frontend, backend, base local y aislamiento de puertos certificados.'
if ($dbPass.Length -lt 24) {
  Write-Host 'Aviso: credencial PostgreSQL heredada pendiente de rotacion segura; no bloquea la certificacion operativa 50A.' -ForegroundColor Yellow
}
