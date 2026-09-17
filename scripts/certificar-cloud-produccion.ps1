param(
  [Parameter(Mandatory=$true)][string]$Url
)
$ErrorActionPreference = 'Stop'
$base = $Url.TrimEnd('/')
if (-not $base.StartsWith('https://')) { throw 'La certificación de producción exige una URL HTTPS.' }

Write-Host '[1/4] HTTPS + frontend...'
$homeResponse = Invoke-WebRequest -UseBasicParsing -Uri $base -TimeoutSec 20
if ($homeResponse.StatusCode -ne 200 -or $homeResponse.Content -notmatch '<div id="root"') { throw 'Frontend cloud no disponible.' }

Write-Host '[2/4] Backend /api + base de datos...'
$ready = Invoke-RestMethod -Uri "$base/api/health/ready" -TimeoutSec 20
if (-not $ready) { throw 'Backend cloud no está ready.' }

Write-Host '[3/4] PWA...'
$manifest = Invoke-WebRequest -UseBasicParsing -Uri "$base/manifest.webmanifest" -TimeoutSec 20
$sw = Invoke-WebRequest -UseBasicParsing -Uri "$base/sw.js" -TimeoutSec 20
if ($manifest.StatusCode -ne 200 -or $sw.StatusCode -ne 200) { throw 'PWA incompleta.' }

Write-Host '[4/4] HTTPS efectivo...'
if ($homeResponse.BaseResponse.ResponseUri.Scheme -ne 'https') { throw 'La respuesta final no usa HTTPS.' }

Write-Host ''
Write-Host 'SIGR CLOUD PRODUCCION OK'
