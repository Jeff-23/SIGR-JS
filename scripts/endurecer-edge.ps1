[CmdletBinding()]
param(
  [switch]$RotateAllSecrets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
$composeFile = Join-Path $repo 'docker-compose.node.yml'
$backupScript = Join-Path $PSScriptRoot 'backup-edge.ps1'
$securityDir = Join-Path $env:LOCALAPPDATA 'SIGR\security'

function Require([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Read-EnvValue([string]$Name) {
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
  if (-not $found) { [void]$Lines.Add("$Name=$Value") }
}

function New-HexSecret([int]$Bytes) {
  $buffer = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return (($buffer | ForEach-Object { $_.ToString('x2') }) -join '')
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

function Protect-EnvAcl([string]$Path) {
  $acl = Get-Acl -LiteralPath $Path
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($rule in @($acl.Access)) {
    [void]$acl.RemoveAccessRuleSpecific($rule)
  }

  $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
  $adminsSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
  foreach ($sid in @($currentSid, $systemSid, $adminsSid)) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $Path -AclObject $acl
}

Require (Test-Path -LiteralPath $envFile) 'Falta deploy/node/.env.'
Require (Test-Path -LiteralPath $composeFile) 'Falta docker-compose.node.yml.'
Require (Test-Path -LiteralPath $backupScript) 'Falta scripts/backup-edge.ps1. Sprint 50B es requisito de 50D.'
Require ($null -ne (Get-Command docker -ErrorAction SilentlyContinue)) 'Docker no esta disponible.'

$httpPort = [int](Read-EnvValue 'NODE_HTTP_PORT')
$dbUser = Read-EnvValue 'POSTGRES_USER'
$dbName = Read-EnvValue 'POSTGRES_DB'
$oldDbPass = Read-EnvValue 'POSTGRES_PASSWORD'
$oldJwt = Read-EnvValue 'JWT_SECRET'
Require ($dbUser -match '^[A-Za-z_][A-Za-z0-9_]*$') 'POSTGRES_USER no es seguro para una rotacion automatica.'
Require (-not [string]::IsNullOrWhiteSpace($dbName)) 'POSTGRES_DB ausente.'
Require (-not [string]::IsNullOrWhiteSpace($oldDbPass)) 'POSTGRES_PASSWORD ausente.'
Require (-not [string]::IsNullOrWhiteSpace($oldJwt)) 'JWT_SECRET ausente.'

Write-Host '[1/8] Validando salud inicial del nodo...'
Push-Location $repo
try {
  docker info *> $null
  Require ($LASTEXITCODE -eq 0) 'Docker Desktop/Engine no esta disponible.'
  docker compose --env-file $envFile -f docker-compose.node.yml config --quiet
  Require ($LASTEXITCODE -eq 0) 'La configuracion Docker EDGE no es valida.'
  Wait-Http "http://localhost:$httpPort/node-health" 30
  Wait-Http "http://localhost:$httpPort/api/health/ready" 30
} finally { Pop-Location }

Write-Host '[2/8] Generando backup obligatorio antes del endurecimiento...'
& powershell -ExecutionPolicy Bypass -File $backupScript
if ($LASTEXITCODE -ne 0) { throw 'El backup previo de 50D fallo.' }

$rotateDb = $RotateAllSecrets -or $oldDbPass.Length -lt 32
$rotateJwt = $RotateAllSecrets -or $oldJwt.Length -lt 48
$newDbPass = if ($rotateDb) { New-HexSecret 48 } else { $oldDbPass }
$newJwt = if ($rotateJwt) { New-HexSecret 64 } else { $oldJwt }

$oldLines = New-Object 'System.Collections.Generic.List[string]'
Get-Content -LiteralPath $envFile | ForEach-Object { [void]$oldLines.Add($_) }
$newLines = New-Object 'System.Collections.Generic.List[string]'
$oldLines | ForEach-Object { [void]$newLines.Add($_) }

Set-EnvValue $newLines 'POSTGRES_PASSWORD' $newDbPass
Set-EnvValue $newLines 'JWT_SECRET' $newJwt
Set-EnvValue $newLines 'METRICS_ENABLED' 'false'
Set-EnvValue $newLines 'SYNC_ENABLED' 'false'
Set-EnvValue $newLines 'SYNC_ROLE' 'EDGE'
Set-EnvValue $newLines 'SYNC_PEER_URL' ''
Set-EnvValue $newLines 'SYNC_PEER_NODE_ID' ''
Set-EnvValue $newLines 'SYNC_PEER_KEY' ''
Set-EnvValue $newLines 'SYNC_CERTIFICATION_ENABLED' 'false'
Set-EnvValue $newLines 'SYNC_CERT_KEY' ''

New-Item -ItemType Directory -Force -Path $securityDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stateFile = Join-Path $securityDir "security-$stamp.json"
$tempEnv = "$envFile.security.tmp"
$dbContainerId = $null
$dbChanged = $false

try {
  Write-Host '[3/8] Rotando credenciales debiles sin exponer secretos...'
  Push-Location $repo
  try {
    $dbContainerId = (docker compose --env-file $envFile -f docker-compose.node.yml ps -q db | Out-String).Trim()
  } finally { Pop-Location }
  Require (-not [string]::IsNullOrWhiteSpace($dbContainerId)) 'No se encontro el contenedor PostgreSQL.'

  if ($rotateDb) {
    $sql = "ALTER ROLE `"$dbUser`" WITH PASSWORD '$newDbPass';"
    docker exec $dbContainerId psql -U $dbUser -d $dbName -v ON_ERROR_STOP=1 -c $sql *> $null
    Require ($LASTEXITCODE -eq 0) 'No fue posible rotar la credencial PostgreSQL.'
    $dbChanged = $true
  }

  $newLines | Set-Content -LiteralPath $tempEnv -Encoding UTF8
  Move-Item -LiteralPath $tempEnv -Destination $envFile -Force
  Protect-EnvAcl $envFile

  Write-Host '[4/8] Recreando servicios con configuracion endurecida...'
  Push-Location $repo
  try {
    docker compose --env-file $envFile -f docker-compose.node.yml up -d --force-recreate db migrate backend frontend
    Require ($LASTEXITCODE -eq 0) 'No fue posible recrear el stack EDGE.'
  } finally { Pop-Location }

  Write-Host '[5/8] Validando autenticacion PostgreSQL con la nueva configuracion...'
  Push-Location $repo
  try {
    $dbContainerId = (docker compose --env-file $envFile -f docker-compose.node.yml ps -q db | Out-String).Trim()
  } finally { Pop-Location }
  Require (-not [string]::IsNullOrWhiteSpace($dbContainerId)) 'No se encontro PostgreSQL despues del endurecimiento.'
  docker exec -e "PGPASSWORD=$newDbPass" $dbContainerId psql -h 127.0.0.1 -U $dbUser -d $dbName -Atqc 'SELECT 1;' *> $null
  Require ($LASTEXITCODE -eq 0) 'La nueva credencial PostgreSQL no autentica por TCP.'

  Write-Host '[6/8] Validando continuidad HTTP...'
  Wait-Http "http://localhost:$httpPort/node-health" 60
  Wait-Http "http://localhost:$httpPort/api/health/ready" 60

  Write-Host '[7/8] Validando configuracion local-first y telemetria...'
  Require ((Read-EnvValue 'SYNC_ENABLED') -eq 'false') 'SYNC_ENABLED debe permanecer false.'
  Require ((Read-EnvValue 'SYNC_ROLE') -eq 'EDGE') 'SYNC_ROLE debe permanecer EDGE.'
  Require ((Read-EnvValue 'METRICS_ENABLED') -eq 'false') 'METRICS_ENABLED debe estar false en el nodo local endurecido.'
  Require ([string]::IsNullOrWhiteSpace((Read-EnvValue 'SYNC_PEER_KEY'))) 'SYNC_PEER_KEY debe estar vacio en modo local-only.'
  Require ([string]::IsNullOrWhiteSpace((Read-EnvValue 'SYNC_CERT_KEY'))) 'SYNC_CERT_KEY debe estar vacio fuera de certificacion.'

  Write-Host '[8/8] Registrando estado de seguridad sin secretos...'
  $state = [ordered]@{
    version = 1
    hardenedAt = (Get-Date).ToString('o')
    nodeId = (Read-EnvValue 'SYNC_NODE_ID')
    dbPasswordRotated = [bool]$rotateDb
    jwtSecretRotated = [bool]$rotateJwt
    dbPasswordLength = $newDbPass.Length
    jwtSecretLength = $newJwt.Length
    metricsEnabled = $false
    syncEnabled = $false
    envAclProtected = (Get-Acl -LiteralPath $envFile).AreAccessRulesProtected
    status = 'HARDENED'
  }
  $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding UTF8
} catch {
  $failure = $_.Exception.Message
  Write-Warning 'Fallo durante el endurecimiento. Revirtiendo configuracion local.'
  try {
    if (Test-Path -LiteralPath $tempEnv) { Remove-Item -LiteralPath $tempEnv -Force -ErrorAction SilentlyContinue }
    $oldLines | Set-Content -LiteralPath $envFile -Encoding UTF8
    if ($dbChanged -and $dbContainerId) {
      $rollbackSql = "ALTER ROLE `"$dbUser`" WITH PASSWORD '$oldDbPass';"
      docker exec $dbContainerId psql -U $dbUser -d $dbName -v ON_ERROR_STOP=1 -c $rollbackSql *> $null
    }
    Push-Location $repo
    try {
      docker compose --env-file $envFile -f docker-compose.node.yml up -d --force-recreate db migrate backend frontend *> $null
    } finally { Pop-Location }
    Protect-EnvAcl $envFile
  } catch {
    Write-Warning 'La reversion automatica no pudo completarse. No se imprimieron secretos; requiere recuperacion operativa manual.'
  }
  $failedState = [ordered]@{
    version = 1
    hardenedAt = (Get-Date).ToString('o')
    nodeId = (Read-EnvValue 'SYNC_NODE_ID')
    status = 'FAILED'
    error = $failure
  }
  $failedState | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding UTF8
  throw $failure
} finally {
  if (Test-Path -LiteralPath $tempEnv) { Remove-Item -LiteralPath $tempEnv -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
Write-Host 'SIGR EDGE ENDURECIMIENTO LOCAL OK' -ForegroundColor Green
Write-Host "Nodo             : $(Read-EnvValue 'SYNC_NODE_ID')"
Write-Host "Password DB fuerte: SI (longitud $($newDbPass.Length), valor oculto)"
Write-Host "JWT fuerte        : SI (longitud $($newJwt.Length), valor oculto)"
Write-Host 'Metricas externas : desactivadas'
Write-Host 'Sync Cloud        : desactivado / claves vacias'
Write-Host 'ACL .env          : herencia desactivada y acceso restringido'
Write-Host "Estado            : $stateFile"
Write-Output "SECURITY_STATE=$stateFile"
