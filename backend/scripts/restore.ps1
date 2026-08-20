param(
  [Parameter(Mandatory = $true)][string]$InputFile,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [switch]$ConfirmRestore
)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmRestore) { throw 'La restauración requiere -ConfirmRestore.' }
if (-not (Test-Path -LiteralPath $InputFile)) { throw "No existe el respaldo: $InputFile" }
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw 'DATABASE_URL es obligatoria.' }
$InputFile = (Resolve-Path -LiteralPath $InputFile).Path
$hashFile = "$InputFile.sha256"
if (-not (Test-Path -LiteralPath $hashFile)) { throw "Falta el checksum obligatorio: $hashFile" }
$esperado = ((Get-Content -LiteralPath $hashFile -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $InputFile).Hash.ToLowerInvariant()
if ($actual -ne $esperado) { throw 'El respaldo no supera la validación SHA256.' }
& pg_restore --clean --if-exists --no-owner --no-privileges --dbname=$DatabaseUrl $InputFile
if ($LASTEXITCODE -ne 0) { throw "pg_restore terminó con código $LASTEXITCODE" }
