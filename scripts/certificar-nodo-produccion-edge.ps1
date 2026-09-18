param(
  [string]$RepoRoot = (Get-Location).Path
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Invoke-Cert([string]$Label, [string]$ScriptPath) {
  Write-Host "`n=== $Label ==="
  Assert (Test-Path -LiteralPath $ScriptPath) "No existe el script requerido: $ScriptPath"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath
  if ($LASTEXITCODE -ne 0) {
    throw "$Label fallo con codigo $LASTEXITCODE"
  }
}

function Get-EnvMap([string]$Path) {
  $map = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*#' -or $line -match '^\s*$') { continue }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { continue }
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1)
    $map[$key] = $value
  }
  return $map
}

function Get-HttpStatus([string]$Url) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 15
    return [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [int]$_.Exception.Response.StatusCode
    }
    return 0
  }
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location $RepoRoot
$envPath = Join-Path $RepoRoot 'deploy\node\.env'
Assert (Test-Path -LiteralPath $envPath) 'No existe deploy/node/.env.'
$cfg = Get-EnvMap $envPath

Write-Host '[1/8] Validando prerequisitos integrales 50A-50E...'
$required = @(
  'scripts\certificar-instalacion-edge.ps1',
  'scripts\certificar-backup-edge.ps1',
  'scripts\certificar-actualizacion-edge.ps1',
  'scripts\certificar-seguridad-edge.ps1',
  'scripts\certificar-continuidad-edge.ps1'
)
foreach ($rel in $required) {
  Assert (Test-Path -LiteralPath (Join-Path $RepoRoot $rel)) "Falta requisito previo: $rel"
}

Write-Host '[2/8] Certificando instalacion EDGE local (50A)...'
Invoke-Cert '50A INSTALACION EDGE' (Join-Path $RepoRoot 'scripts\certificar-instalacion-edge.ps1')

Write-Host '[3/8] Certificando backup y restauracion aislada (50B)...'
Invoke-Cert '50B BACKUP Y RESTAURACION' (Join-Path $RepoRoot 'scripts\certificar-backup-edge.ps1')

Write-Host '[4/8] Certificando actualizacion segura y rollback (50C)...'
Invoke-Cert '50C ACTUALIZACION SEGURA' (Join-Path $RepoRoot 'scripts\certificar-actualizacion-edge.ps1')

Write-Host '[5/8] Certificando seguridad local (50D)...'
Invoke-Cert '50D SEGURIDAD LOCAL' (Join-Path $RepoRoot 'scripts\certificar-seguridad-edge.ps1')

Write-Host '[6/8] Certificando continuidad y recuperacion (50E)...'
Invoke-Cert '50E CONTINUIDAD Y RECUPERACION' (Join-Path $RepoRoot 'scripts\certificar-continuidad-edge.ps1')

Write-Host '[7/8] Validando invariantes finales de produccion local...'
Assert ($cfg.ContainsKey('SYNC_ROLE') -and $cfg['SYNC_ROLE'] -eq 'EDGE') 'SYNC_ROLE debe ser EDGE.'
Assert ($cfg.ContainsKey('SYNC_ENABLED') -and $cfg['SYNC_ENABLED'].ToLowerInvariant() -eq 'false') 'SYNC_ENABLED debe permanecer false.'

& docker info *> $null
Assert ($LASTEXITCODE -eq 0) 'Docker Engine no esta disponible al cierre.'

$composeArgs = @('--env-file', '.\deploy\node\.env', '-f', '.\docker-compose.node.yml')
$db = (& docker compose @composeArgs ps -q db | Select-Object -First 1)
$backend = (& docker compose @composeArgs ps -q backend | Select-Object -First 1)
$frontend = (& docker compose @composeArgs ps -q frontend | Select-Object -First 1)
Assert (-not [string]::IsNullOrWhiteSpace($db)) 'No se encontro contenedor DB.'
Assert (-not [string]::IsNullOrWhiteSpace($backend)) 'No se encontro contenedor backend.'
Assert (-not [string]::IsNullOrWhiteSpace($frontend)) 'No se encontro contenedor frontend.'

function Get-Health([string]$ContainerId) {
  $status = (& docker inspect $ContainerId --format '{{.State.Status}}').Trim()
  $health = (& docker inspect $ContainerId --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}').Trim()
  return "$status/$health"
}

$dbHealth = Get-Health $db
$backendHealth = Get-Health $backend
$frontendHealth = Get-Health $frontend
Assert ($dbHealth -eq 'running/healthy') "DB no saludable: $dbHealth"
Assert ($backendHealth -eq 'running/healthy') "Backend no saludable: $backendHealth"
Assert ($frontendHealth -eq 'running/healthy') "Frontend no saludable: $frontendHealth"

$nodeHealth = Get-HttpStatus 'http://localhost:8080/node-health'
$ready = Get-HttpStatus 'http://localhost:8080/api/health/ready'
Assert ($nodeHealth -eq 200) "node-health no responde 200: $nodeHealth"
Assert ($ready -eq 200) "ready no responde 200: $ready"

$backendPorts = (& docker port $backend 2>$null) -join "`n"
Assert ([string]::IsNullOrWhiteSpace($backendPorts)) 'Backend no debe publicar puertos directos al host.'
$dbPorts = (& docker port $db 2>$null) -join "`n"
Assert ($dbPorts -match '127\.0\.0\.1:') 'PostgreSQL debe estar publicado solo en loopback.'

$backupDir = Join-Path $env:LOCALAPPDATA 'SIGR\backups'
$latestBackup = @(Get-ChildItem -LiteralPath $backupDir -Filter 'SIGR-edge-backup-*.zip' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)[0]
Assert ($null -ne $latestBackup) 'No existe backup EDGE certificado.'
$backupAgeHours = ((Get-Date) - $latestBackup.LastWriteTime).TotalHours
Assert ($backupAgeHours -le 24) ("El ultimo backup tiene {0:N2} h; debe ser <= 24 h." -f $backupAgeHours)

$securityDir = Join-Path $env:LOCALAPPDATA 'SIGR\security'
$securityFile = @(Get-ChildItem -LiteralPath $securityDir -Filter 'security-*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)[0]
Assert ($null -ne $securityFile) 'No existe estado de seguridad 50D.'
$security = Get-Content -LiteralPath $securityFile.FullName -Raw | ConvertFrom-Json
Assert ([string]$security.status -eq 'HARDENED') 'El ultimo estado de seguridad no es HARDENED.'

$continuityDir = Join-Path $env:LOCALAPPDATA 'SIGR\continuity'
$diagPath = Join-Path $continuityDir 'diagnostic-latest.json'
Assert (Test-Path -LiteralPath $diagPath) 'No existe diagnostico de continuidad.'
$diag = Get-Content -LiteralPath $diagPath -Raw | ConvertFrom-Json
Assert ([string]$diag.status -eq 'HEALTHY') 'El diagnostico de continuidad final no es HEALTHY.'

Write-Host '[8/8] Registrando certificacion integral sin secretos...'
$prodDir = Join-Path $env:LOCALAPPDATA 'SIGR\production-readiness'
New-Item -ItemType Directory -Path $prodDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$statePath = Join-Path $prodDir ("production-ready-$stamp.json")
$commit = (& git rev-parse HEAD).Trim()
$nodeId = if ($cfg.ContainsKey('SYNC_NODE_ID')) { $cfg['SYNC_NODE_ID'] } elseif ($cfg.ContainsKey('NODE_ID')) { $cfg['NODE_ID'] } else { 'edge-local' }
$record = [ordered]@{
  status = 'PRODUCTION_READY_LOCAL'
  certifiedAt = (Get-Date).ToString('o')
  node = $nodeId
  commit = $commit
  syncRole = 'EDGE'
  syncEnabled = $false
  nodeHealth = $nodeHealth
  ready = $ready
  db = $dbHealth
  backend = $backendHealth
  frontend = $frontendHealth
  latestBackup = $latestBackup.FullName
  latestBackupAgeHours = [math]::Round($backupAgeHours, 2)
  security = 'HARDENED'
  continuity = 'HEALTHY'
  certifications = @('50A','50B','50C','50D','50E')
  secretsStored = $false
}
$record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding UTF8

Write-Host ''
Write-Host 'SIGR SPRINT 50F NODO EDGE LISTO PARA PRODUCCION OK'
Write-Host "Nodo              : $nodeId"
Write-Host "Commit            : $commit"
Write-Host 'Modo              : EDGE local-first / Cloud desactivado'
Write-Host "Docker            : DB=$dbHealth Backend=$backendHealth Frontend=$frontendHealth"
Write-Host "HTTP              : node-health=$nodeHealth ready=$ready"
Write-Host ("Ultimo backup     : {0} ({1:N2} h)" -f $latestBackup.FullName, $backupAgeHours)
Write-Host 'Seguridad         : HARDENED'
Write-Host 'Continuidad       : HEALTHY'
Write-Host "Estado produccion : $statePath"
Write-Output "PRODUCTION_READY_STATE=$statePath"
