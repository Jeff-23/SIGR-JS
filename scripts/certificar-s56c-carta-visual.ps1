$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Run-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Name fallo con codigo $LASTEXITCODE" }
}

Write-Host "Certificacion S56C - Carta visual configurable" -ForegroundColor Cyan

$page = Get-Content -Raw (Join-Path $Root 'frontend/src/pages/DailyMenuPage.tsx')
$dto = Get-Content -Raw (Join-Path $Root 'backend/src/modulos/carta-dia/dto/guardar-plantilla-carta.dto.ts')

if ($page -notmatch 'fondoColor') { throw 'Falta personalizacion de fondo' }
if ($page -notmatch 'imagenPortadaProductoId') { throw 'Falta imagen de portada' }
if ($page -match 'const payload = \{ \.\.\.template') { throw 'El guardado aun envia metadatos de lectura' }
if ($dto -notmatch 'mostrarImagenesProductos') { throw 'Backend no acepta configuracion de imagenes' }

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

Write-Host "`nSIGR S56C CARTA VISUAL CONFIGURABLE OK" -ForegroundColor Green
