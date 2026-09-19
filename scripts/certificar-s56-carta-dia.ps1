$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Run-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Name fallo con codigo $LASTEXITCODE" }
}

Write-Host "Certificacion S56 - Carta del dia dinamica" -ForegroundColor Cyan

$schema = Get-Content -Raw (Join-Path $Root 'backend/prisma/schema.prisma')
$service = Get-Content -Raw (Join-Path $Root 'backend/src/modulos/carta-dia/carta-dia.service.ts')
$publicMenu = Get-Content -Raw (Join-Path $Root 'backend/src/modulos/menu-qr/menu-qr.service.ts')
$page = Get-Content -Raw (Join-Path $Root 'frontend/src/pages/DailyMenuPage.tsx')

if ($schema -notmatch 'model CartaDia') { throw 'Falta modelo CartaDia' }
if ($service -notmatch 'contenidoPredeterminado') { throw 'Falta carta diaria predeterminada' }
if ($publicMenu -notmatch 'cartaDia') { throw 'Menu QR no consume CartaDia' }
if ($page -notmatch 'Especial de hoy') { throw 'Editor no contiene especial libre diario' }
if ($page -notmatch 'Descargar PNG') { throw 'Falta exportacion PNG' }
if ($page -notmatch 'Imprimir / PDF') { throw 'Falta salida imprimible/PDF' }

Run-Step 'Prisma generate' {
  Push-Location (Join-Path $Root 'backend')
  try { npx prisma generate } finally { Pop-Location }
}

Run-Step 'Prisma validate' {
  Push-Location (Join-Path $Root 'backend')
  try { npx prisma validate } finally { Pop-Location }
}

Run-Step 'Backend build' {
  Push-Location (Join-Path $Root 'backend')
  try { npm run build } finally { Pop-Location }
}

Run-Step 'Frontend lint' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run lint } finally { Pop-Location }
}

Run-Step 'Frontend build' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run build } finally { Pop-Location }
}

Write-Host "`nSIGR S56 CARTA DEL DIA DINAMICA OK" -ForegroundColor Green
