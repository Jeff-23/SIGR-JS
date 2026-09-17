param(
  [Parameter(Mandatory = $true)][string]$BackupDir,
  [string]$DbContainer
)
. "$PSScriptRoot\backup-common.ps1"

$check = Assert-BackupManifest -BackupDir $BackupDir
$dir = $check.dir
$manifest = $check.manifest
$container = Get-SigrPostgresContainer -PreferredName $DbContainer
$dbFile = Join-Path $dir ([string]$manifest.database.file)
$mediaZip = Join-Path $dir ([string]$manifest.media.file)
$tempDb = "/tmp/sigr-verify-$([Guid]::NewGuid().ToString('N')).dump"
$tempMedia = Join-Path ([System.IO.Path]::GetTempPath()) "sigr-media-verify-$([Guid]::NewGuid().ToString('N'))"
try {
  docker cp $dbFile "${container}:$tempDb" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar database.dump al contenedor para verificarlo.' }
  $tocCount = docker exec $container sh -lc "pg_restore -l '$tempDb' | grep -v '^;' | grep -v '^$' | wc -l"
  if ($LASTEXITCODE -ne 0 -or [int]$tocCount -le 0) { throw 'database.dump no contiene un catálogo pg_restore válido.' }

  New-Item -ItemType Directory -Path $tempMedia | Out-Null
  Expand-Archive -LiteralPath $mediaZip -DestinationPath $tempMedia -Force
  $restoredMedia = @(Get-ChildItem -LiteralPath $tempMedia -File -Recurse -Force | Where-Object { $_.Name -ne '.empty' })
  $expectedCount = [int]$manifest.media.archivos
  if ($restoredMedia.Count -ne $expectedCount) { throw "Media incompleta: esperados $expectedCount archivos, recuperados $($restoredMedia.Count)." }

  Write-Host 'BACKUP VERIFICADO' -ForegroundColor Green
  Write-Host "SHA-256 BD:    $($manifest.database.sha256)"
  Write-Host "SHA-256 media: $($manifest.media.sha256)"
  Write-Host "Entradas dump: $tocCount"
  Write-Host "Archivos media: $($restoredMedia.Count)"
}
finally {
  docker exec $container rm -f $tempDb 2>$null | Out-Null
  if (Test-Path -LiteralPath $tempMedia) { Remove-Item -LiteralPath $tempMedia -Recurse -Force -ErrorAction SilentlyContinue }
}
