param(
  [string]$OutputRoot,
  [string]$DbContainer,
  [string]$MediaDir,
  [int]$RetentionDays = 0
)
. "$PSScriptRoot\backup-common.ps1"

$backendRoot = Get-SigrBackendRoot
$repoRoot = Get-SigrRepoRoot
if (-not $OutputRoot) { $OutputRoot = Join-Path $repoRoot 'backups' }
if (-not $MediaDir) { $MediaDir = Join-Path $backendRoot 'storage\media' }
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$MediaDir = [System.IO.Path]::GetFullPath($MediaDir)
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$container = Get-SigrPostgresContainer -PreferredName $DbContainer
$dbUser = Get-ContainerEnv -Container $container -Name 'POSTGRES_USER'
$dbName = Get-ContainerEnv -Container $container -Name 'POSTGRES_DB'
$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$backupDir = Join-Path $OutputRoot "sigr-backup-$stamp"
New-Item -ItemType Directory -Path $backupDir | Out-Null
$dbFile = Join-Path $backupDir 'database.dump'
$mediaZip = Join-Path $backupDir 'media.zip'
$tempDb = "/tmp/sigr-backup-$stamp.dump"
$tempMedia = Join-Path ([System.IO.Path]::GetTempPath()) "sigr-media-backup-$stamp-$([Guid]::NewGuid().ToString('N'))"

try {
  Write-Host "[1/5] PostgreSQL ($container / $dbName)..."
  docker exec $container sh -lc "pg_dump -U '$dbUser' -d '$dbName' -Fc -f '$tempDb'"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump falló con código $LASTEXITCODE" }
  docker cp "${container}:$tempDb" $dbFile | Out-Null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $dbFile) -or (Get-Item $dbFile).Length -le 0) { throw 'No se pudo copiar un database.dump válido.' }
  docker exec $container rm -f $tempDb | Out-Null

  Write-Host '[2/5] Imágenes/media...'
  New-Item -ItemType Directory -Path $tempMedia | Out-Null
  $mediaFiles = @()
  if (Test-Path -LiteralPath $MediaDir) {
    Get-ChildItem -LiteralPath $MediaDir -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $tempMedia -Recurse -Force }
    $mediaFiles = @(Get-ChildItem -LiteralPath $MediaDir -File -Recurse -Force)
  }
  if (-not (Get-ChildItem -LiteralPath $tempMedia -Force | Select-Object -First 1)) { Set-Content -LiteralPath (Join-Path $tempMedia '.empty') -Value '' -Encoding ascii }
  Compress-Archive -Path (Join-Path $tempMedia '*') -DestinationPath $mediaZip -CompressionLevel Optimal

  Write-Host '[3/5] Integridad SHA-256...'
  $dbHash = Get-FileSha256Lower $dbFile
  $mediaHash = Get-FileSha256Lower $mediaZip

  Write-Host '[4/5] Manifest...'
  $manifest = [ordered]@{
    version = 2
    producto = 'SIGR-JS'
    creadoEn = (Get-Date).ToUniversalTime().ToString('o')
    host = $env:COMPUTERNAME
    postgres = [ordered]@{ container=$container; database=$dbName; user=$dbUser }
    database = [ordered]@{ file='database.dump'; sha256=$dbHash; bytes=(Get-Item $dbFile).Length }
    media = [ordered]@{
      file='media.zip'; sha256=$mediaHash; archivos=$mediaFiles.Count
      bytesOrigen=0
      rutaOrigen=$MediaDir
    }
  }
  $mediaBytes = ($mediaFiles | Measure-Object -Property Length -Sum).Sum
  if ($null -eq $mediaBytes) { $mediaBytes = 0 }
  $manifest.media.bytesOrigen = [int64]$mediaBytes
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $backupDir 'manifest.json') -Encoding utf8

  Write-Host '[5/5] Verificación del backup recién creado...'
  & "$PSScriptRoot\verify-backup.ps1" -BackupDir $backupDir -DbContainer $container
  if ($LASTEXITCODE -ne 0) { throw 'La verificación automática del backup falló.' }

  Write-Host ''
  Write-Host 'BACKUP COMPLETO CREADO Y VERIFICADO' -ForegroundColor Green
  Write-Host "Ubicación: $backupDir"
  Get-ChildItem -LiteralPath $backupDir | Select-Object Name, Length, LastWriteTime

  if ($RetentionDays -gt 0) {
    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    $oldBackups = @(Get-ChildItem -LiteralPath $OutputRoot -Directory -Filter 'sigr-backup-*' | Where-Object { $_.FullName -ne $backupDir -and $_.LastWriteTime -lt $cutoff })
    foreach ($old in $oldBackups) {
      Write-Host "Eliminando backup fuera de retención ($RetentionDays días): $($old.Name)"
      Remove-Item -LiteralPath $old.FullName -Recurse -Force
    }
  }
}
catch {
  if (Test-Path -LiteralPath $backupDir) { Remove-Item -LiteralPath $backupDir -Recurse -Force -ErrorAction SilentlyContinue }
  throw
}
finally {
  docker exec $container rm -f $tempDb 2>$null | Out-Null
  if (Test-Path -LiteralPath $tempMedia) { Remove-Item -LiteralPath $tempMedia -Recurse -Force -ErrorAction SilentlyContinue }
}
