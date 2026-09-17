param(
  [Parameter(Mandatory = $true)][string]$OutputDir,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$MediaDir = $env:MEDIA_STORAGE_DIR
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw 'DATABASE_URL es obligatoria.' }
if ([string]::IsNullOrWhiteSpace($MediaDir)) { $MediaDir = 'storage/media' }
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)
$MediaDir = [System.IO.Path]::GetFullPath($MediaDir)
if (Test-Path -LiteralPath $OutputDir) { throw "El destino ya existe y no se sobrescribirá: $OutputDir" }
New-Item -ItemType Directory -Path $OutputDir | Out-Null

$dbFile = Join-Path $OutputDir 'database.dump'
& "$PSScriptRoot\backup.ps1" -OutputFile $dbFile -DatabaseUrl $DatabaseUrl

$tempMedia = Join-Path $OutputDir '_media_stage'
New-Item -ItemType Directory -Path $tempMedia | Out-Null
if (Test-Path -LiteralPath $MediaDir) {
  Get-ChildItem -LiteralPath $MediaDir -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $tempMedia -Recurse -Force
  }
}
if (-not (Get-ChildItem -LiteralPath $tempMedia -Force | Select-Object -First 1)) {
  Set-Content -LiteralPath (Join-Path $tempMedia '.empty') -Value '' -Encoding ascii
}
$mediaZip = Join-Path $OutputDir 'media.zip'
Compress-Archive -Path (Join-Path $tempMedia '*') -DestinationPath $mediaZip -CompressionLevel Optimal
Remove-Item -LiteralPath $tempMedia -Recurse -Force

$dbHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dbFile).Hash.ToLowerInvariant()
$mediaHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $mediaZip).Hash.ToLowerInvariant()
$mediaFiles = if (Test-Path -LiteralPath $MediaDir) { @(Get-ChildItem -LiteralPath $MediaDir -File -Recurse -Force) } else { @() }
$manifest = [ordered]@{
  version = 1
  creadoEn = (Get-Date).ToUniversalTime().ToString('o')
  database = [ordered]@{ file = 'database.dump'; sha256 = $dbHash; bytes = (Get-Item $dbFile).Length }
  media = [ordered]@{ file = 'media.zip'; sha256 = $mediaHash; archivos = $mediaFiles.Count; bytesOrigen = ($mediaFiles | Measure-Object -Property Length -Sum).Sum }
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDir 'manifest.json') -Encoding utf8
Write-Host "Backup completo creado: $OutputDir"
Get-ChildItem -LiteralPath $OutputDir | Select-Object Name, Length, LastWriteTime
