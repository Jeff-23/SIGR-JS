$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Run-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Name fallo con codigo $LASTEXITCODE" }
}

$controller = Get-Content -Raw (Join-Path $Root 'backend/src/modulos/comandas/comandas.controller.ts')
$kds = Get-Content -Raw (Join-Path $Root 'frontend/src/pages/RealKitchenPage.tsx')
$migration = Get-Content -Raw (Join-Path $Root 'backend/prisma/migrations/20260919000500_s54_permiso_imprimir_comandas/migration.sql')

if ($controller -notmatch "@Permisos\('COMANDAS_IMPRIMIR'\)[\s\S]*representacionImpresa") {
  throw 'Representacion impresa no esta protegida por COMANDAS_IMPRIMIR'
}
if ($controller -notmatch "@Permisos\('COMANDAS_IMPRIMIR'\)[\s\S]*registrarImpresion") {
  throw 'Registro de impresion no esta protegido por COMANDAS_IMPRIMIR'
}
if ($kds -notmatch 'canPrint = hasPermission\("COMANDAS_IMPRIMIR"\)') {
  throw 'KDS no comprueba COMANDAS_IMPRIMIR'
}
if ($migration -notmatch "RESTAURANTE:%:CAJERO") {
  throw 'Migracion no concede impresion a CAJERO'
}
if ($migration -notmatch "RESTAURANTE:%:ADMIN") {
  throw 'Migracion no concede impresion a ADMIN'
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

Write-Host "`nSIGR S54 PERMISO IMPRESION COMANDAS OK" -ForegroundColor Green
