$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Run-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Name fallo con codigo $LASTEXITCODE" }
}

Write-Host "Certificacion S53 - cuenta solo despues de entrega" -ForegroundColor Cyan

$pedidos = Join-Path $Root 'backend/src/modulos/pedidos/pedidos.service.ts'
$contenido = Get-Content -Raw -Path $pedidos
if ($contenido -notmatch "pedido\.estado\s*!==\s*EstadoPedido\.ENTREGADO") {
  throw 'Backend no bloquea solicitar cuenta antes de pedido ENTREGADO'
}
if ($contenido -notmatch 'No se puede solicitar la cuenta hasta que el pedido haya sido entregado al cliente') {
  throw 'No se encontro el mensaje operativo de bloqueo de cuenta'
}
Write-Host 'Regla backend de entrega previa verificada.' -ForegroundColor DarkGreen

Run-Step 'Backend build completo' {
  Push-Location (Join-Path $Root 'backend')
  try { npm run build } finally { Pop-Location }
}

Run-Step 'Frontend test contrato Salon' {
  Push-Location (Join-Path $Root 'frontend')
  try { npx vitest run src/features/salon/contracts.spec.ts } finally { Pop-Location }
}

Run-Step 'Frontend lint' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run lint } finally { Pop-Location }
}

Run-Step 'Frontend build' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run build } finally { Pop-Location }
}

Write-Host "`nSIGR S53 CUENTA SOLO TRAS ENTREGA OK" -ForegroundColor Green
