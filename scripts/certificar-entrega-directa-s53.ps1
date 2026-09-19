$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Run-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Name fallo con codigo $LASTEXITCODE" }
}

Run-Step 'Prisma generate' {
  Push-Location (Join-Path $Root 'backend')
  try { npx prisma generate } finally { Pop-Location }
}

Run-Step 'Prisma validate' {
  Push-Location (Join-Path $Root 'backend')
  try { npx prisma validate } finally { Pop-Location }
}

Run-Step 'Backend lint focal S53' {
  Push-Location (Join-Path $Root 'backend')
  try {
    npx eslint `
      src/modulos/comandas/comandas.service.ts `
      src/modulos/productos/dto/create-producto.dto.ts `
      src/modulos/productos/dto/update-producto.dto.ts `
      src/modulos/sucursales/sucursales.service.ts
  } finally { Pop-Location }
}

Run-Step 'Backend build completo (incluye sync S53)' {
  Push-Location (Join-Path $Root 'backend')
  try { npm run build } finally { Pop-Location }
}

Run-Step 'Verificar contrato sync requierePreparacion' {
  $syncProducer = Join-Path $Root 'backend/src/modulos/sync/sync-business.service.ts'
  $syncConsumer = Join-Path $Root 'backend/src/modulos/sync/sync-business-apply.service.ts'

  $producerText = Get-Content -Raw -Path $syncProducer
  $consumerText = Get-Content -Raw -Path $syncConsumer

  if ($producerText -notmatch 'requierePreparacion') {
    throw 'El snapshot de Producto no contiene requierePreparacion'
  }
  if ($consumerText -notmatch 'requierePreparacion') {
    throw 'La aplicacion de sync de Producto no contempla requierePreparacion'
  }

  $compatNullish = $consumerText -match 'requierePreparacion\s*\?\?\s*true'
  $compatTernaria = $consumerText -match 'p\.requierePreparacion\s*===\s*undefined[\s\S]{0,120}\?\s*true[\s\S]{0,120}:\s*booleano\(p\.requierePreparacion'

  if (-not ($compatNullish -or $compatTernaria)) {
    throw 'Sync no conserva compatibilidad: requierePreparacion ausente debe resolverse a true'
  }

  Write-Host 'Contrato sync de Producto S53 verificado.' -ForegroundColor DarkGreen
  $global:LASTEXITCODE = 0
}

Run-Step 'Verificar estacion Despacho S53' {
  $migration = Join-Path $Root 'backend/prisma/migrations/20260918224500_s53_despacho_operativo/migration.sql'
  $sucursales = Join-Path $Root 'backend/src/modulos/sucursales/sucursales.service.ts'

  $migrationText = Get-Content -Raw -Path $migration
  $sucursalesText = Get-Content -Raw -Path $sucursales

  if ($migrationText -notmatch "'DESPACHO'") {
    throw 'La migracion S53 no crea la estacion DESPACHO'
  }
  if ($migrationText -notmatch "S53:DESPACHO:") {
    throw 'La estacion DESPACHO no usa identidad determinista por sucursal'
  }
  if ($sucursalesText -notmatch "codigo:\s*'DESPACHO'") {
    throw 'Las sucursales nuevas no crean la estacion DESPACHO'
  }

  Write-Host 'Estacion Despacho S53 verificada.' -ForegroundColor DarkGreen
  $global:LASTEXITCODE = 0
}

Run-Step 'Frontend lint' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run lint } finally { Pop-Location }
}

Run-Step 'Frontend build' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run build } finally { Pop-Location }
}

Write-Host "`nSIGR SPRINT 53 PUERTA SOFTWARE ENTREGA DIRECTA OK" -ForegroundColor Green
