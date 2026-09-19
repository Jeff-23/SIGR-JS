$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
function Run-Step([string]$Name, [scriptblock]$Action) { Write-Host "`n==> $Name" -ForegroundColor Cyan; & $Action; if ($LASTEXITCODE -ne 0) { throw "$Name fallo con codigo $LASTEXITCODE" } }
Write-Host "Certificacion S56B - Carta profesional configurable" -ForegroundColor Cyan
$service = Get-Content -Raw (Join-Path $Root 'backend/src/modulos/carta-dia/carta-dia.service.ts')
$menu = Get-Content -Raw (Join-Path $Root 'backend/src/modulos/menu-qr/menu-qr.service.ts')
$page = Get-Content -Raw (Join-Path $Root 'frontend/src/pages/DailyMenuPage.tsx')
$public = Get-Content -Raw (Join-Path $Root 'frontend/src/pages/PublicQrMenuPage.tsx')
if ($service -notmatch 'CARTA_PLANTILLA') { throw 'Falta persistencia de plantilla' }
if ($page -notmatch 'Configurar carta base') { throw 'Falta editor de carta base' }
if ($page -notmatch 'PNG completo') { throw 'Falta salida PNG completa' }
if ($page -notmatch 'EDITORIAL_DORADO') { throw 'Faltan estilos profesionales' }
if ($menu -notmatch 'plantillaCarta') { throw 'Menu publico no recibe plantilla' }
if ($public -notmatch 'plantillaCarta') { throw 'Frontend QR no usa plantilla' }
Run-Step 'Backend build' { Push-Location (Join-Path $Root 'backend'); try { npm run build } finally { Pop-Location } }
Run-Step 'Frontend lint' { Push-Location (Join-Path $Root 'frontend'); try { npm run lint } finally { Pop-Location } }
Run-Step 'Frontend build' { Push-Location (Join-Path $Root 'frontend'); try { npm run build } finally { Pop-Location } }
Write-Host "`nSIGR S56B CARTA PROFESIONAL CONFIGURABLE OK" -ForegroundColor Green
