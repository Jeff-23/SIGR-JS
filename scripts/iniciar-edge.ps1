[CmdletBinding()]
param(
  [switch]$Startup,
  [int]$DockerWaitSeconds = 600
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
$composeFile = Join-Path $repo 'docker-compose.node.yml'
$continuityDir = Join-Path $env:LOCALAPPDATA 'SIGR\continuity'

function Require([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Read-EnvValue([string]$Name) {
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
  } finally {
    $ErrorActionPreference = $old
  }
}

function Start-DockerDesktopIfPresent {
  $candidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe')
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      try {
        Start-Process -FilePath $candidate | Out-Null
        return $candidate
      } catch { }
    }
  }
  return $null
}

function Wait-Docker([int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-DockerReady) { return $true }
    Start-Sleep -Seconds 5
  }
  return $false
}

function Wait-Http([string]$Url, [int]$Attempts = 90) {
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { return [int]$response.StatusCode }
    } catch { }
    Start-Sleep -Seconds 2
  }
  throw "No respondio a tiempo: $Url"
}

function Write-ContinuityState([string]$Status, [string]$ErrorText, [bool]$DockerStarted, [int]$NodeHealth, [int]$ReadyHealth) {
  New-Item -ItemType Directory -Force -Path $continuityDir | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $path = Join-Path $continuityDir "continuity-$stamp.json"
  $state = [ordered]@{
    version = 1
    at = (Get-Date).ToString('o')
    nodeId = (Read-EnvValue 'SYNC_NODE_ID')
    source = $(if ($Startup) { 'WINDOWS_STARTUP' } else { 'MANUAL' })
    status = $Status
    dockerDesktopStartedByScript = $DockerStarted
    nodeHealthStatus = $NodeHealth
    readyStatus = $ReadyHealth
    error = $ErrorText
  }
  $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $path -Encoding UTF8
  return $path
}

Require (Test-Path -LiteralPath $envFile) 'Falta deploy/node/.env.'
Require (Test-Path -LiteralPath $composeFile) 'Falta docker-compose.node.yml.'
Require ($null -ne (Get-Command docker -ErrorAction SilentlyContinue)) 'Docker CLI no esta disponible.'
Require ($DockerWaitSeconds -ge 30 -and $DockerWaitSeconds -le 1800) 'DockerWaitSeconds debe estar entre 30 y 1800.'

$dockerStarted = $false
$nodeHealth = 0
$readyHealth = 0
$stateFile = $null

try {
  Write-Host '[1/5] Verificando Docker Engine...'
  if (-not (Test-DockerReady)) {
    if ($Startup) {
      $desktop = Start-DockerDesktopIfPresent
      if ($desktop) {
        $dockerStarted = $true
        Write-Host 'Docker Desktop fue solicitado; esperando que el Engine quede disponible...'
      } else {
        Write-Host 'Docker Engine aun no esta disponible; esperando inicio externo de Docker Desktop...'
      }
    }
    Require (Wait-Docker $DockerWaitSeconds) "Docker Engine no estuvo disponible despues de $DockerWaitSeconds segundos."
  }

  Write-Host '[2/5] Validando configuracion EDGE...'
  Push-Location $repo
  try {
    docker compose --env-file $envFile -f $composeFile config --quiet
    Require ($LASTEXITCODE -eq 0) 'docker-compose.node.yml / deploy/node/.env no son validos.'

    Write-Host '[3/5] Levantando servicios locales...'
    docker compose --env-file $envFile -f $composeFile up -d db migrate backend frontend
    Require ($LASTEXITCODE -eq 0) 'No fue posible levantar el stack EDGE.'
  } finally { Pop-Location }

  Write-Host '[4/5] Esperando salud HTTP...'
  $portText = Read-EnvValue 'NODE_HTTP_PORT'
  if ([string]::IsNullOrWhiteSpace($portText)) { $portText = '8080' }
  $httpPort = [int]$portText
  $nodeHealth = Wait-Http "http://localhost:$httpPort/node-health" 90
  $readyHealth = Wait-Http "http://localhost:$httpPort/api/health/ready" 90

  Write-Host '[5/5] Registrando continuidad sin secretos...'
  $stateFile = Write-ContinuityState 'HEALTHY' '' $dockerStarted $nodeHealth $readyHealth
} catch {
  $message = $_.Exception.Message
  try { $stateFile = Write-ContinuityState 'FAILED' $message $dockerStarted $nodeHealth $readyHealth } catch { }
  throw $message
}

Write-Host ''
Write-Host 'SIGR EDGE CONTINUIDAD OK' -ForegroundColor Green
Write-Host "Nodo       : $(Read-EnvValue 'SYNC_NODE_ID')"
Write-Host 'Docker     : disponible'
Write-Host "node-health: HTTP $nodeHealth"
Write-Host "ready      : HTTP $readyHealth"
Write-Host "Estado     : $stateFile"
Write-Output "CONTINUITY_STATE=$stateFile"
