[CmdletBinding()]
param(
  [ValidateSet('Reiniciar','VerificarBackup','RestaurarProduccion')]
  [string]$Modo = 'Reiniciar',
  [string]$BackupPath = '',
  [string]$Confirmacion = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$startScript = Join-Path $PSScriptRoot 'iniciar-edge.ps1'
$restoreScript = Join-Path $PSScriptRoot 'restaurar-edge.ps1'

if (-not (Test-Path -LiteralPath $startScript)) { throw 'Falta scripts/iniciar-edge.ps1.' }
if (-not (Test-Path -LiteralPath $restoreScript)) { throw 'Falta scripts/restaurar-edge.ps1. Sprint 50B es requisito de 50E.' }

switch ($Modo) {
  'Reiniciar' {
    & powershell -ExecutionPolicy Bypass -File $startScript
    if ($LASTEXITCODE -ne 0) { throw 'No fue posible recuperar el nodo reiniciando el stack local.' }
    return
  }
  'VerificarBackup' {
    $args = @('-ExecutionPolicy','Bypass','-File',$restoreScript,'-Modo','Verificar')
    if (-not [string]::IsNullOrWhiteSpace($BackupPath)) { $args += @('-BackupPath',$BackupPath) }
    & powershell @args
    if ($LASTEXITCODE -ne 0) { throw 'La verificacion del backup fallo.' }
    return
  }
  'RestaurarProduccion' {
    if ($Confirmacion -ne 'RESTAURAR-SIGR') { throw 'Restaurar produccion requiere -Confirmacion RESTAURAR-SIGR.' }
    $args = @('-ExecutionPolicy','Bypass','-File',$restoreScript,'-Modo','Produccion','-Confirmacion','RESTAURAR-SIGR')
    if (-not [string]::IsNullOrWhiteSpace($BackupPath)) { $args += @('-BackupPath',$BackupPath) }
    & powershell @args
    if ($LASTEXITCODE -ne 0) { throw 'La restauracion de produccion fallo.' }
    & powershell -ExecutionPolicy Bypass -File $startScript
    if ($LASTEXITCODE -ne 0) { throw 'La base fue restaurada pero el nodo no recupero salud automaticamente.' }
    return
  }
}
