param(
  [Parameter(Mandatory = $true)][string]$InputDir,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$MediaDir = $env:MEDIA_STORAGE_DIR,
  [switch]$ConfirmRestore
)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmRestore) { throw 'La restauración completa requiere -ConfirmRestore.' }
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw 'DATABASE_URL es obligatoria.' }
if ([string]::IsNullOrWhiteSpace($MediaDir)) { $MediaDir = 'storage/media' }
$InputDir = (Resolve-Path -LiteralPath $InputDir).Path
$MediaDir = [System.IO.Path]::GetFullPath($MediaDir)
$manifestFile = Join-Path $InputDir 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestFile)) { throw 'Falta manifest.json.' }
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
$dbFile = Join-Path $InputDir $manifest.database.file
$mediaZip = Join-Path $InputDir $manifest.media.file
foreach ($pair in @(@($dbFile, $manifest.database.sha256), @($mediaZip, $manifest.media.sha256))) {
  if (-not (Test-Path -LiteralPath $pair[0])) { throw "Falta archivo de respaldo: $($pair[0])" }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $pair[0]).Hash.ToLowerInvariant()
  if ($actual -ne ([string]$pair[1]).ToLowerInvariant()) { throw "Checksum inválido: $($pair[0])" }
}

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("sigr-media-restore-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
Expand-Archive -LiteralPath $mediaZip -DestinationPath $temp -Force

& "$PSScriptRoot\restore.ps1" -InputFile $dbFile -DatabaseUrl $DatabaseUrl -ConfirmRestore

$parent = Split-Path -Parent $MediaDir
if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
$previous = $null
if (Test-Path -LiteralPath $MediaDir) {
  $previous = "$MediaDir.pre-restore-$((Get-Date).ToString('yyyyMMddHHmmss'))"
  Move-Item -LiteralPath $MediaDir -Destination $previous
}
New-Item -ItemType Directory -Path $MediaDir | Out-Null
Get-ChildItem -LiteralPath $temp -Force | Where-Object { $_.Name -ne '.empty' } | ForEach-Object {
  Move-Item -LiteralPath $_.FullName -Destination $MediaDir
}
Remove-Item -LiteralPath $temp -Recurse -Force
Write-Host "Restauración completa finalizada. Media restaurada en: $MediaDir"
if ($previous) { Write-Warning "La media anterior se conservó temporalmente en: $previous" }
