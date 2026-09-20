$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Run-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Name fallo con codigo $LASTEXITCODE" }
}

Write-Host "Certificacion S56E - Fondo, PNG y PDF de cartas" -ForegroundColor Cyan

$page = Get-Content -Raw (Join-Path $Root 'frontend/src/pages/DailyMenuPage.tsx')
$controller = Get-Content -Raw (Join-Path $Root 'backend/src/modulos/carta-dia/carta-media.controller.ts')
$dto = Get-Content -Raw (Join-Path $Root 'backend/src/modulos/carta-dia/dto/perfil-carta.dto.ts')

if ($page -notmatch 'tarjetaOpacidad') { throw 'Falta transparencia configurable de tarjetas' }
if ($page -notmatch 'identity.logoUrl \|\| template.logoUrl') { throw 'PNG no usa logo compartido' }
if ($page -notmatch 'document.createElement\("iframe"\)') { throw 'Impresion aun depende de popup' }
if ($controller -notmatch 'Access-Control-Allow-Origin') { throw 'Media de carta sin CORS para canvas' }
if ($dto -notmatch '@Max\(0.75\)') { throw 'Opacidad de fondo no fue ampliada' }

Run-Step 'Backend build' {
  Push-Location (Join-Path $Root 'backend')
  try { npm run build } finally { Pop-Location }
}

Run-Step 'Lint backend focal' {
  Push-Location (Join-Path $Root 'backend')
  try { npx eslint src/modulos/carta-dia/carta-media.controller.ts src/modulos/carta-dia/carta-dia.service.ts src/modulos/carta-dia/dto/perfil-carta.dto.ts } finally { Pop-Location }
}

Run-Step 'Frontend lint' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run lint } finally { Pop-Location }
}

Run-Step 'Frontend build' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run build } finally { Pop-Location }
}

Write-Host "`nSIGR S56E EXPORTACION Y FONDO DE CARTA OK" -ForegroundColor Green
