param(
  [Parameter(Mandatory = $true)][string]$OutputFile,
  [string]$DatabaseUrl = $env:DATABASE_URL
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw 'DATABASE_URL es obligatoria.' }
$parent = Split-Path -Parent $OutputFile
if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
& pg_dump --format=custom --no-owner --no-privileges --file=$OutputFile $DatabaseUrl
if ($LASTEXITCODE -ne 0) { throw "pg_dump terminó con código $LASTEXITCODE" }
Get-Item -LiteralPath $OutputFile | Select-Object FullName, Length, LastWriteTime
