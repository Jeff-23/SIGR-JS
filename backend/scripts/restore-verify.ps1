param(
  [Parameter(Mandatory = $true)][string]$BackupDir,
  [string]$DbContainer,
  [string]$TestDatabase
)
. "$PSScriptRoot\backup-common.ps1"

$check = Assert-BackupManifest -BackupDir $BackupDir
$dir = $check.dir
$manifest = $check.manifest
$container = Get-SigrPostgresContainer -PreferredName $DbContainer
$dbUser = Get-ContainerEnv -Container $container -Name 'POSTGRES_USER'
if (-not $TestDatabase) { $TestDatabase = 'sigr_restore_verify_' + (Get-Date).ToString('yyyyMMddHHmmss') }
if ($TestDatabase -notmatch '^sigr_restore_verify_[A-Za-z0-9_]+$') { throw 'Por seguridad, la base temporal debe comenzar por sigr_restore_verify_.' }
$dbFile = Join-Path $dir ([string]$manifest.database.file)
$mediaZip = Join-Path $dir ([string]$manifest.media.file)
$tempDb = "/tmp/$TestDatabase.dump"
$tempMedia = Join-Path ([System.IO.Path]::GetTempPath()) "sigr-restore-verify-$([Guid]::NewGuid().ToString('N'))"

try {
  Write-Host "Creando base temporal: $TestDatabase"
  docker exec $container createdb -U $dbUser $TestDatabase
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base temporal.' }
  docker cp $dbFile "${container}:$tempDb" | Out-Null
  docker exec $container pg_restore -U $dbUser -d $TestDatabase --clean --if-exists $tempDb
  if ($LASTEXITCODE -ne 0) { throw 'pg_restore falló en la base temporal.' }
  $tableCount = docker exec $container psql -U $dbUser -d $TestDatabase -Atc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';"
  if ($LASTEXITCODE -ne 0 -or [int]$tableCount -le 0) { throw 'La base temporal restaurada no contiene tablas públicas.' }

  New-Item -ItemType Directory -Path $tempMedia | Out-Null
  Expand-Archive -LiteralPath $mediaZip -DestinationPath $tempMedia -Force
  $mediaCount = @(Get-ChildItem -LiteralPath $tempMedia -File -Recurse -Force | Where-Object { $_.Name -ne '.empty' }).Count
  if ($mediaCount -ne [int]$manifest.media.archivos) { throw 'La restauración temporal de media no coincide con el manifest.' }

  Write-Host 'RESTAURACIÓN DE VERIFICACIÓN APROBADA' -ForegroundColor Green
  Write-Host "Tablas restauradas: $tableCount"
  Write-Host "Archivos media: $mediaCount"
}
finally {
  docker exec $container rm -f $tempDb 2>$null | Out-Null
  docker exec $container dropdb -U $dbUser --if-exists $TestDatabase 2>$null | Out-Null
  if (Test-Path -LiteralPath $tempMedia) { Remove-Item -LiteralPath $tempMedia -Recurse -Force -ErrorAction SilentlyContinue }
}
