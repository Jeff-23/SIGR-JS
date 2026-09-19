$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Run-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Name fallo con codigo $LASTEXITCODE" }
}

Write-Host "Certificacion S56D - Perfiles de carta y turnos" -ForegroundColor Cyan

$schema = Get-Content -Raw (Join-Path $Root 'backend/prisma/schema.prisma')
$service = Get-Content -Raw (Join-Path $Root 'backend/src/modulos/carta-dia/carta-dia.service.ts')
$menuQr = Get-Content -Raw (Join-Path $Root 'backend/src/modulos/menu-qr/menu-qr.service.ts')
$page = Get-Content -Raw (Join-Path $Root 'frontend/src/pages/DailyMenuPage.tsx')
$publicPage = Get-Content -Raw (Join-Path $Root 'frontend/src/pages/PublicQrMenuPage.tsx')

if ($schema -notmatch 'model PerfilCarta') { throw 'Falta modelo PerfilCarta' }
if ($schema -notmatch '@@unique\(\[perfilCartaId, fecha\]\)') { throw 'CartaDia no esta separada por perfil' }
if ($service -notmatch 'CARTA_IDENTIDAD') { throw 'Falta identidad visual compartida del restaurante' }
if ($service -notmatch 'guardarRecurso') { throw 'Falta carga de logo/fondo' }
if ($menuQr -notmatch 'perfilActivo') { throw 'Menu QR no selecciona carta por activacion/horario' }
if ($menuQr -notmatch 'perfilesCarta') { throw 'Menu QR no publica perfiles activos' }
if ($page -notmatch 'Nueva carta') { throw 'Frontend no permite multiples cartas' }
if ($page -notmatch 'Logo del restaurante') { throw 'Frontend no expone logo compartido' }
if ($page -notmatch 'Arte de fondo opcional') { throw 'Frontend no expone fondo por carta' }
if ($publicPage -notmatch 'Elige la carta') { throw 'QR no permite elegir cuando coinciden varias cartas' }

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

Run-Step 'Lint backend S56D' {
  Push-Location (Join-Path $Root 'backend')
  try {
    npx eslint `
      src/modulos/carta-dia/carta-dia.service.ts `
      src/modulos/carta-dia/carta-dia.controller.ts `
      src/modulos/carta-dia/carta-media.controller.ts `
      src/modulos/carta-dia/dto/perfil-carta.dto.ts `
      src/modulos/menu-qr/menu-qr.service.ts
  } finally { Pop-Location }
}

Run-Step 'Frontend lint' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run lint } finally { Pop-Location }
}

Run-Step 'Frontend build' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run build } finally { Pop-Location }
}

Write-Host "`nSIGR S56D PERFILES DE CARTA Y TURNOS OK" -ForegroundColor Green
