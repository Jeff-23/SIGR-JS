param(
  [Parameter(Mandatory = $true)][string]$OutputFile,
  [string]$DatabaseUrl = $env:DATABASE_URL
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw 'DATABASE_URL es obligatoria.' }
$OutputFile = [System.IO.Path]::GetFullPath($OutputFile)
if (Test-Path -LiteralPath $OutputFile) { throw "El respaldo ya existe y no se sobrescribirá: $OutputFile" }
$parent = Split-Path -Parent $OutputFile
if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
& pg_dump --format=custom --no-owner --no-privileges --file=$OutputFile $DatabaseUrl
if ($LASTEXITCODE -ne 0) { throw "pg_dump terminó con código $LASTEXITCODE" }
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $OutputFile).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$OutputFile.sha256" -Value "$hash  $([System.IO.Path]::GetFileName($OutputFile))" -Encoding ascii
Get-Item -LiteralPath $OutputFile | Select-Object FullName, Length, LastWriteTime
