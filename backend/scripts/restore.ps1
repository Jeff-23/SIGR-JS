param(
  [Parameter(Mandatory = $true)][string]$InputFile,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [switch]$ConfirmRestore
)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmRestore) { throw 'La restauración requiere -ConfirmRestore.' }
if (-not (Test-Path -LiteralPath $InputFile)) { throw "No existe el respaldo: $InputFile" }
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw 'DATABASE_URL es obligatoria.' }
& pg_restore --clean --if-exists --no-owner --no-privileges --dbname=$DatabaseUrl $InputFile
if ($LASTEXITCODE -ne 0) { throw "pg_restore terminó con código $LASTEXITCODE" }
