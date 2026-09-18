[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo 'deploy\node\.env'
$composeFile = Join-Path $repo 'docker-compose.node.yml'
$startScript = Join-Path $PSScriptRoot 'iniciar-edge.ps1'
$autostartScript = Join-Path $PSScriptRoot 'configurar-arranque-edge.ps1'
$diagnosticScript = Join-Path $PSScriptRoot 'diagnosticar-caida-edge.ps1'
$recoveryScript = Join-Path $PSScriptRoot 'recuperar-edge.ps1'
$restoreScript = Join-Path $PSScriptRoot 'restaurar-edge.ps1'
$continuityDir = Join-Path $env:LOCALAPPDATA 'SIGR\continuity'

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

Write-Host '[1/8] Validando prerequisitos de continuidad...'
foreach ($file in @($envFile,$composeFile,$startScript,$autostartScript,$diagnosticScript,$recoveryScript,$restoreScript)) {
  Assert (Test-Path -LiteralPath $file) "Falta requisito: $file"
}
Assert ($null -ne (Get-Command docker -ErrorAction SilentlyContinue)) 'Docker CLI no esta disponible.'
New-Item -ItemType Directory -Force -Path $continuityDir | Out-Null

Write-Host '[2/8] Configurando arranque automatico tras inicio de sesion...'
& powershell -ExecutionPolicy Bypass -File $autostartScript
if ($LASTEXITCODE -ne 0) { throw 'No fue posible configurar el arranque automatico.' }
$startupDir = [Environment]::GetFolderPath('Startup')
$launcher = Join-Path $startupDir 'SIGR-EDGE-Autostart.cmd'
Assert (Test-Path -LiteralPath $launcher) 'No se creo el lanzador de Startup.'
$launcherRaw = Get-Content -LiteralPath $launcher -Raw
Assert ($launcherRaw.Contains('iniciar-edge.ps1')) 'El lanzador de Startup no apunta a iniciar-edge.ps1.'
Assert ($launcherRaw.Contains('-Startup')) 'El lanzador de Startup no usa el modo Startup.'

Write-Host '[3/8] Validando salud inicial del nodo...'
$portText = Read-EnvValue 'NODE_HTTP_PORT'
if ([string]::IsNullOrWhiteSpace($portText)) { $portText = '8080' }
$httpPort = [int]$portText
Assert ((Get-HttpStatus "http://localhost:$httpPort/node-health") -eq 200) 'node-health no esta saludable antes de la prueba.'
Assert ((Get-HttpStatus "http://localhost:$httpPort/api/health/ready") -eq 200) 'health/ready no esta saludable antes de la prueba.'

Write-Host '[4/8] Simulando caida de frontend/backend y recuperacion automatizada...'
Push-Location $repo
try {
  docker compose --env-file $envFile -f $composeFile stop frontend backend
  Assert ($LASTEXITCODE -eq 0) 'No fue posible simular la interrupcion de frontend/backend.'
} finally { Pop-Location }
Start-Sleep -Seconds 2
& powershell -ExecutionPolicy Bypass -File $startScript -DockerWaitSeconds 180
if ($LASTEXITCODE -ne 0) { throw 'iniciar-edge.ps1 no recupero el nodo.' }
Assert ((Get-HttpStatus "http://localhost:$httpPort/node-health") -eq 200) 'node-health no se recupero.'
Assert ((Get-HttpStatus "http://localhost:$httpPort/api/health/ready") -eq 200) 'health/ready no se recupero.'

$continuityStates = @(Get-ChildItem -LiteralPath $continuityDir -Filter 'continuity-*.json' -File | Sort-Object LastWriteTime -Descending)
Assert ($continuityStates.Count -ge 1) 'No se registro estado de continuidad.'
$latestContinuity = Get-Content -LiteralPath $continuityStates[0].FullName -Raw | ConvertFrom-Json
Assert ($latestContinuity.status -eq 'HEALTHY') 'El ultimo estado de continuidad no es HEALTHY.'
Assert ([int]$latestContinuity.nodeHealthStatus -eq 200) 'El estado registrado no certifica node-health=200.'
Assert ([int]$latestContinuity.readyStatus -eq 200) 'El estado registrado no certifica ready=200.'

Write-Host '[5/8] Certificando diagnostico de nodo caido / saludable...'
& powershell -ExecutionPolicy Bypass -File $diagnosticScript
if ($LASTEXITCODE -ne 0) { throw 'diagnosticar-caida-edge.ps1 fallo.' }
$diagnosticPath = Join-Path $continuityDir 'diagnostic-latest.json'
Assert (Test-Path -LiteralPath $diagnosticPath) 'No se genero diagnostic-latest.json.'
$diagnostic = Get-Content -LiteralPath $diagnosticPath -Raw | ConvertFrom-Json
Assert ($diagnostic.status -eq 'HEALTHY') 'El diagnostico final no clasifica el nodo como HEALTHY.'
Assert ($diagnostic.dockerReady -eq $true) 'El diagnostico no confirma Docker disponible.'
Assert ([int]$diagnostic.nodeHealthStatus -eq 200) 'El diagnostico no confirma node-health=200.'
Assert ([int]$diagnostic.readyStatus -eq 200) 'El diagnostico no confirma ready=200.'

Write-Host '[6/8] Verificando recuperabilidad del ultimo backup sin tocar produccion...'
& powershell -ExecutionPolicy Bypass -File $recoveryScript -Modo VerificarBackup
if ($LASTEXITCODE -ne 0) { throw 'El ultimo backup no pudo restaurarse en modo de verificacion.' }
Assert ((Get-HttpStatus "http://localhost:$httpPort/node-health") -eq 200) 'Produccion perdio salud despues de verificar el backup.'
Assert ((Get-HttpStatus "http://localhost:$httpPort/api/health/ready") -eq 200) 'Backend perdio salud despues de verificar el backup.'

Write-Host '[7/8] Validando que continuidad no almacena secretos...'
$dbPass = Read-EnvValue 'POSTGRES_PASSWORD'
$jwt = Read-EnvValue 'JWT_SECRET'
$filesToInspect = @($launcher, $diagnosticPath) + @($continuityStates | ForEach-Object { $_.FullName })
foreach ($path in $filesToInspect) {
  if (-not (Test-Path -LiteralPath $path)) { continue }
  $raw = Get-Content -LiteralPath $path -Raw
  if (-not [string]::IsNullOrWhiteSpace($dbPass)) { Assert (-not $raw.Contains($dbPass)) "Se encontro POSTGRES_PASSWORD en $path" }
  if (-not [string]::IsNullOrWhiteSpace($jwt)) { Assert (-not $raw.Contains($jwt)) "Se encontro JWT_SECRET en $path" }
}

Write-Host '[8/8] Validando modo local-first y politica de recuperacion...'
Assert ((Read-EnvValue 'SYNC_ENABLED') -eq 'false') 'SYNC_ENABLED debe permanecer false.'
Assert ((Read-EnvValue 'SYNC_ROLE') -eq 'EDGE') 'SYNC_ROLE debe permanecer EDGE.'
$recoveryRaw = Get-Content -LiteralPath $recoveryScript -Raw
Assert ($recoveryRaw.Contains("-Confirmacion RESTAURAR-SIGR")) 'La restauracion productiva debe conservar confirmacion explicita.'

Write-Host ''
Write-Host 'SIGR SPRINT 50E CONTINUIDAD Y RECUPERACION OK' -ForegroundColor Green
Write-Host 'Arranque automatico : configurado al iniciar sesion de Windows'
Write-Host 'Docker Desktop      : iniciado/esperado por el recuperador'
Write-Host 'Caida de servicios  : simulada y recuperada'
Write-Host 'Diagnostico         : HEALTHY despues de recuperacion'
Write-Host 'Backup              : restaurado en base temporal aislada'
Write-Host 'Produccion          : intacta y saludable'
Write-Host 'Secretos            : excluidos de lanzador e historial'
Write-Host 'Restore produccion  : protegido por confirmacion explicita'
