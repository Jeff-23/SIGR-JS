$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Run-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Name fallo con codigo $LASTEXITCODE" }
}

Write-Host "Certificacion S55 - Menu QR configurable" -ForegroundColor Cyan

$catalogo = Get-Content -Raw (Join-Path $Root 'backend/src/modulos/configuracion/configuracion.catalogo.ts')
$servicio = Get-Content -Raw (Join-Path $Root 'backend/src/modulos/menu-qr/menu-qr.service.ts')
$publico = Get-Content -Raw (Join-Path $Root 'frontend/src/pages/PublicQrMenuPage.tsx')
$settings = Get-Content -Raw (Join-Path $Root 'frontend/src/pages/SettingsPage.tsx')
$qrPage = Get-Content -Raw (Join-Path $Root 'frontend/src/pages/QrOrdersPage.tsx')

if ($catalogo -notmatch "QR_MODO") { throw 'Falta QR_MODO en catalogo' }
if ($catalogo -notmatch "SOLO_MENU") { throw 'Falta modo SOLO_MENU' }
if ($catalogo -notmatch "PEDIDO_CON_APROBACION") { throw 'Falta modo PEDIDO_CON_APROBACION' }
if ($catalogo -notmatch "PEDIDO_AUTOMATICO") { throw 'Falta modo PEDIDO_AUTOMATICO' }
if ($servicio -notmatch "modoQr === 'SOLO_MENU'") { throw 'Backend no bloquea pedidos en SOLO_MENU' }
if ($servicio -notmatch "modoQr === 'PEDIDO_AUTOMATICO'") { throw 'Backend no distingue pedido automatico' }
if ($publico -notmatch "Para realizar tu pedido, comunícate con tu mesero") { throw 'Menu publico no informa flujo SOLO_MENU' }
if ($settings -notmatch "Modo del menú QR") { throw 'Configuracion no expone modo QR' }
if ($qrPage -notmatch "misma red local/Wi-Fi") { throw 'Pagina QR no advierte alcance de IP privada' }

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

Write-Host "`nSIGR S55 MENU QR CONFIGURABLE OK" -ForegroundColor Green
