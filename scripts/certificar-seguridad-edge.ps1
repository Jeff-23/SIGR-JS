[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
$composeFile = Join-Path $repo 'docker-compose.node.yml'
$hardeningScript = Join-Path $PSScriptRoot 'endurecer-edge.ps1'
$statusScript = Join-Path $PSScriptRoot 'estado-seguridad-edge.ps1'
$securityDir = Join-Path $env:LOCALAPPDATA 'SIGR\security'

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Read-EnvValue([string]$Name) {
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

function Get-HttpStatus([string]$Url) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
    return [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode.value__ }
    return 0
  }
}

Write-Host '[1/8] Validando prerequisitos de seguridad...'
Assert (Test-Path -LiteralPath $envFile) 'Falta deploy/node/.env.'
Assert (Test-Path -LiteralPath $composeFile) 'Falta docker-compose.node.yml.'
Assert (Test-Path -LiteralPath $hardeningScript) 'Falta scripts/endurecer-edge.ps1.'
Assert (Test-Path -LiteralPath $statusScript) 'Falta scripts/estado-seguridad-edge.ps1.'
Assert (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'backup-edge.ps1')) 'Sprint 50B es requisito de 50D.'

Write-Host '[2/8] Aplicando endurecimiento seguro e idempotente...'
& powershell -ExecutionPolicy Bypass -File $hardeningScript
if ($LASTEXITCODE -ne 0) { throw 'endurecer-edge.ps1 fallo.' }

Write-Host '[3/8] Validando fortaleza de secretos sin mostrarlos...'
$dbPass = Read-EnvValue 'POSTGRES_PASSWORD'
$jwt = Read-EnvValue 'JWT_SECRET'
Assert (-not [string]::IsNullOrWhiteSpace($dbPass) -and $dbPass.Length -ge 32) 'POSTGRES_PASSWORD no cumple el minimo de 32 caracteres.'
Assert (-not [string]::IsNullOrWhiteSpace($jwt) -and $jwt.Length -ge 48) 'JWT_SECRET no cumple el minimo de 48 caracteres.'
Assert ((Read-EnvValue 'METRICS_ENABLED') -eq 'false') 'METRICS_ENABLED debe estar false.'
Assert ((Read-EnvValue 'SYNC_ENABLED') -eq 'false') 'SYNC_ENABLED debe estar false en el primer restaurante local-only.'
Assert ((Read-EnvValue 'SYNC_ROLE') -eq 'EDGE') 'SYNC_ROLE debe ser EDGE.'
Assert ([string]::IsNullOrWhiteSpace((Read-EnvValue 'SYNC_PEER_KEY'))) 'SYNC_PEER_KEY debe estar vacio.'
Assert ([string]::IsNullOrWhiteSpace((Read-EnvValue 'SYNC_CERT_KEY'))) 'SYNC_CERT_KEY debe estar vacio.'

Write-Host '[4/8] Validando autenticacion real de PostgreSQL...'
$dbUser = Read-EnvValue 'POSTGRES_USER'
$dbName = Read-EnvValue 'POSTGRES_DB'
Push-Location $repo
try {
  $dbId = (docker compose --env-file $envFile -f docker-compose.node.yml ps -q db | Out-String).Trim()
  $backendId = (docker compose --env-file $envFile -f docker-compose.node.yml ps -q backend | Out-String).Trim()
  Assert (-not [string]::IsNullOrWhiteSpace($dbId)) 'No se encontro el contenedor db.'
  Assert (-not [string]::IsNullOrWhiteSpace($backendId)) 'No se encontro el contenedor backend.'
  docker exec -e "PGPASSWORD=$dbPass" $dbId psql -h 127.0.0.1 -U $dbUser -d $dbName -Atqc 'SELECT 1;' *> $null
  Assert ($LASTEXITCODE -eq 0) 'PostgreSQL no autentica con la credencial endurecida.'

  Write-Host '[5/8] Validando aislamiento de puertos Docker...'
  $dbInspect = docker inspect $dbId | ConvertFrom-Json
  $backendInspect = docker inspect $backendId | ConvertFrom-Json
  $dbBindings = $dbInspect[0].NetworkSettings.Ports.'5432/tcp'
  $backendBindings = $backendInspect[0].NetworkSettings.Ports.'3000/tcp'
  Assert ($null -ne $dbBindings -and @($dbBindings).Count -ge 1) 'PostgreSQL debe estar publicado solo para soporte local.'
  foreach ($binding in @($dbBindings)) {
    Assert ($binding.HostIp -eq '127.0.0.1') 'PostgreSQL debe estar enlazado exclusivamente a 127.0.0.1.'
  }
  Assert ($null -eq $backendBindings -or @($backendBindings).Count -eq 0) 'El backend no debe publicar 3000 al host.'
} finally { Pop-Location }

Write-Host '[6/8] Validando ACL de deploy/node/.env...'
$acl = Get-Acl -LiteralPath $envFile
Assert ($acl.AreAccessRulesProtected) 'deploy/node/.env debe tener herencia ACL desactivada.'
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$currentRule = @($acl.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $currentSid -and $_.AccessControlType -eq 'Allow' })
Assert ($currentRule.Count -ge 1) 'El usuario actual debe conservar acceso a deploy/node/.env.'

Write-Host '[7/8] Validando superficie HTTP de produccion...'
$httpPort = [int](Read-EnvValue 'NODE_HTTP_PORT')
Assert ((Get-HttpStatus "http://localhost:$httpPort/node-health") -eq 200) 'node-health no responde 200.'
Assert ((Get-HttpStatus "http://localhost:$httpPort/api/health/ready") -eq 200) 'health/ready no responde 200.'
Assert ((Get-HttpStatus "http://localhost:$httpPort/api/docs") -eq 404) 'Swagger /api/docs debe estar deshabilitado.'
Assert ((Get-HttpStatus "http://localhost:$httpPort/api/health/metrics") -eq 404) 'Metricas HTTP deben estar deshabilitadas.'

Write-Host '[8/8] Validando historial de seguridad y ausencia de secretos...'
$states = @(Get-ChildItem -LiteralPath $securityDir -Filter 'security-*.json' -File | Sort-Object LastWriteTime -Descending)
Assert ($states.Count -ge 1) 'No existe historial de endurecimiento.'
$latest = Get-Content -LiteralPath $states[0].FullName -Raw | ConvertFrom-Json
Assert ($latest.status -eq 'HARDENED') 'El ultimo estado de seguridad no es HARDENED.'
$rawState = Get-Content -LiteralPath $states[0].FullName -Raw
Assert (-not $rawState.Contains($dbPass)) 'El historial contiene POSTGRES_PASSWORD.'
Assert (-not $rawState.Contains($jwt)) 'El historial contiene JWT_SECRET.'

& powershell -ExecutionPolicy Bypass -File $statusScript

Write-Host ''
Write-Host 'SIGR SPRINT 50D SEGURIDAD LOCAL OK' -ForegroundColor Green
Write-Host 'Credenciales        : fuertes; valores nunca impresos'
Write-Host 'PostgreSQL           : autenticacion verificada y solo loopback'
Write-Host 'Backend              : sin puerto directo al host'
Write-Host 'Swagger / metricas   : deshabilitados'
Write-Host 'Sync Cloud           : deshabilitado y sin claves activas'
Write-Host 'deploy/node/.env     : ACL restringida'
Write-Host 'Historial seguridad  : sin secretos'
