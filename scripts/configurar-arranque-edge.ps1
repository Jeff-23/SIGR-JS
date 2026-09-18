[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$startScript = Join-Path $PSScriptRoot 'iniciar-edge.ps1'
$startupDir = [Environment]::GetFolderPath('Startup')

if ([string]::IsNullOrWhiteSpace($startupDir)) { throw 'Windows no reporto la carpeta Startup del usuario actual.' }
if (-not (Test-Path -LiteralPath $startScript)) { throw 'Falta scripts/iniciar-edge.ps1.' }

New-Item -ItemType Directory -Force -Path $startupDir | Out-Null
$launcher = Join-Path $startupDir 'SIGR-EDGE-Autostart.cmd'
$command = '@echo off' + [Environment]::NewLine +
  'start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $startScript + '" -Startup' + [Environment]::NewLine +
  'exit /b 0' + [Environment]::NewLine
Set-Content -LiteralPath $launcher -Value $command -Encoding ASCII

Write-Host ''
Write-Host 'SIGR EDGE ARRANQUE AUTOMATICO CONFIGURADO' -ForegroundColor Green
Write-Host 'Momento    : al iniciar sesion el usuario de Windows'
Write-Host 'Docker     : se inicia/espera desde iniciar-edge.ps1'
Write-Host "Lanzador   : $launcher"
Write-Host "Repositorio: $repo"
Write-Output "AUTOSTART_PATH=$launcher"
