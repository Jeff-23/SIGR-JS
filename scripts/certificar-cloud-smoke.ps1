$ErrorActionPreference = 'Stop'
$base = 'http://localhost:8081'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'deploy\cloud\.env.smoke'
$composeArgs = @('--env-file', $envFile, '-f', (Join-Path $root 'docker-compose.cloud.yml'), '-f', (Join-Path $root 'docker-compose.cloud-smoke.yml'))

Write-Host '[1/5] Servicios aislados de cloud...'
$psOutput = & docker compose @composeArgs ps
if ($LASTEXITCODE -ne 0) { throw 'No fue posible consultar los servicios cloud.' }
$psText = ($psOutput | Out-String)
foreach ($service in @('db','backend','frontend','gateway')) {
  if ($psText -notmatch $service) { throw "Falta el servicio cloud: $service" }
}

Write-Host '[2/5] Frontend a través del gateway...'
$homeResponse = Invoke-WebRequest -UseBasicParsing -Uri $base -TimeoutSec 15
if ($homeResponse.StatusCode -ne 200 -or $homeResponse.Content -notmatch '<div id="root"') { throw 'El frontend cloud no respondió correctamente.' }

Write-Host '[3/5] Backend + PostgreSQL a través de /api...'
$ready = Invoke-RestMethod -Uri "$base/api/health/ready" -TimeoutSec 15
if (-not $ready) { throw 'El backend cloud no respondió en health/ready.' }

Write-Host '[4/5] PWA...'
$manifest = Invoke-WebRequest -UseBasicParsing -Uri "$base/manifest.webmanifest" -TimeoutSec 15
$sw = Invoke-WebRequest -UseBasicParsing -Uri "$base/sw.js" -TimeoutSec 15
if ($manifest.StatusCode -ne 200 -or $sw.StatusCode -ne 200) { throw 'Manifest o Service Worker no están disponibles.' }

Write-Host '[5/5] Superficie de red del stack...'
$publishedOutput = & docker compose @composeArgs ps --format json
if ($LASTEXITCODE -ne 0) { throw 'No fue posible inspeccionar la superficie de red.' }
$publishedText = ($publishedOutput | Out-String)
if ($publishedText -match '0\.0\.0\.0:5432' -or $publishedText -match '127\.0\.0\.1:5432' -or $publishedText -match '0\.0\.0\.0:3000' -or $publishedText -match '127\.0\.0\.1:3000') {
  throw 'DB o backend aparecen publicados; deben permanecer internos.'
}

Write-Host ''
Write-Host 'SIGR CLOUD SMOKE OK'
Write-Host 'Topología cloud validada localmente. HTTPS real requiere VPS + dominio DNS.'
