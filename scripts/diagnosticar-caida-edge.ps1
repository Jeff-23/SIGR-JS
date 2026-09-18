[CmdletBinding()]
param(
  [int]$StabilizationSeconds = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
$composeFile = Join-Path $repo 'docker-compose.node.yml'
$continuityDir = Join-Path $env:LOCALAPPDATA 'SIGR\continuity'
$backupDir = Join-Path $env:LOCALAPPDATA 'SIGR\backups'

function Read-EnvValue([string]$Name) {
  if (-not (Test-Path -LiteralPath $envFile)) { return $null }
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

function Test-DockerReady {
  $old = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    docker info *> $null
    return ($LASTEXITCODE -eq 0)
  } finally { $ErrorActionPreference = $old }
}

function Get-HttpStatus([string]$Url) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4
    return [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode.value__ }
    return 0
  }
}

function Get-ServiceState([string]$Service) {
  if (-not $dockerReady) { return 'DOCKER_UNAVAILABLE' }
  Push-Location $repo
  try {
    $id = (docker compose --env-file $envFile -f $composeFile ps -q $Service | Out-String).Trim()
  } finally { Pop-Location }
  if ([string]::IsNullOrWhiteSpace($id)) { return 'MISSING' }
  $state = (docker inspect $id --format '{{.State.Status}}' | Out-String).Trim()
  $health = (docker inspect $id --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' | Out-String).Trim()
  if (-not [string]::IsNullOrWhiteSpace($health)) { return "$state/$health" }
  return $state
}

New-Item -ItemType Directory -Force -Path $continuityDir | Out-Null
$dockerReady = $false
if ($null -ne (Get-Command docker -ErrorAction SilentlyContinue)) { $dockerReady = Test-DockerReady }
$portText = Read-EnvValue 'NODE_HTTP_PORT'
if ([string]::IsNullOrWhiteSpace($portText)) { $portText = '8080' }
$httpPort = [int]$portText

$deadline = (Get-Date).AddSeconds([math]::Max(0, $StabilizationSeconds))
$dbState = 'UNKNOWN'
$backendState = 'UNKNOWN'
$frontendState = 'UNKNOWN'
$nodeHealth = 0
$readyHealth = 0

do {
  $dbState = Get-ServiceState 'db'
  $backendState = Get-ServiceState 'backend'
  $frontendState = Get-ServiceState 'frontend'
  $nodeHealth = Get-HttpStatus "http://localhost:$httpPort/node-health"
  $readyHealth = Get-HttpStatus "http://localhost:$httpPort/api/health/ready"

  $servicesHealthy = ($dbState -match '^running/healthy$' -and $backendState -match '^running/healthy$' -and $frontendState -match '^running/healthy$')
  $httpHealthy = ($nodeHealth -eq 200 -and $readyHealth -eq 200)
  if ($dockerReady -and $servicesHealthy -and $httpHealthy) { break }

  if ((Get-Date) -ge $deadline) { break }
  Start-Sleep -Seconds 2
} while ($true)

$latestBackup = $null
$backupAgeHours = $null
if (Test-Path -LiteralPath $backupDir) {
  $items = @(Get-ChildItem -LiteralPath $backupDir -Filter 'SIGR-edge-backup-*.zip' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
  if ($items.Count -gt 0) {
    $latestBackup = $items[0].FullName
    $backupAgeHours = [math]::Round(((Get-Date) - $items[0].LastWriteTime).TotalHours, 2)
  }
}

$status = 'DEGRADED'
if ($dockerReady -and $nodeHealth -eq 200 -and $readyHealth -eq 200 -and $dbState -match '^running/healthy$' -and $backendState -match '^running/healthy$' -and $frontendState -match '^running/healthy$') {
  $status = 'HEALTHY'
}

$diagnostic = [ordered]@{
  version = 1
  at = (Get-Date).ToString('o')
  nodeId = Read-EnvValue 'SYNC_NODE_ID'
  status = $status
  dockerReady = $dockerReady
  db = $dbState
  backend = $backendState
  frontend = $frontendState
  nodeHealthStatus = $nodeHealth
  readyStatus = $readyHealth
  latestBackup = $latestBackup
  latestBackupAgeHours = $backupAgeHours
}
$diagnosticPath = Join-Path $continuityDir 'diagnostic-latest.json'
$diagnostic | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $diagnosticPath -Encoding UTF8

Write-Host 'SIGR EDGE - DIAGNOSTICO DE CONTINUIDAD' -ForegroundColor Cyan
Write-Host "Nodo        : $($diagnostic.nodeId)"
Write-Host "Estado      : $status"
Write-Host "Docker      : $dockerReady"
Write-Host "DB          : $dbState"
Write-Host "Backend     : $backendState"
Write-Host "Frontend    : $frontendState"
Write-Host "node-health : HTTP $nodeHealth"
Write-Host "ready       : HTTP $readyHealth"
if ($latestBackup) { Write-Host "Ultimo backup: $latestBackup ($backupAgeHours h)" } else { Write-Host 'Ultimo backup: NO ENCONTRADO' }
Write-Host "Diagnostico : $diagnosticPath"
Write-Output "DIAGNOSTIC_PATH=$diagnosticPath"
Write-Output "DIAGNOSTIC_STATUS=$status"
