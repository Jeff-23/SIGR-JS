$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Run-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Name fallo con codigo $LASTEXITCODE" }
}

Write-Host "Certificacion S53 - liberacion de mesa tras pago completo" -ForegroundColor Cyan

$ventas = Join-Path $Root 'backend/src/modulos/ventas/ventas.service.ts'
$contenido = Get-Content -Raw -Path $ventas

if ($contenido -notmatch 'pedido\?\.estado\s*===\s*EstadoPedido\.ENTREGADO') {
  throw 'La liberacion no esta condicionada a pedido ENTREGADO'
}

if ($contenido -notmatch 'in:\s*\[EstadoMesa\.OCUPADA,\s*EstadoMesa\.PENDIENTE_PAGO\]') {
  throw 'La liberacion no contempla OCUPADA y PENDIENTE_PAGO'
}

if ($contenido -notmatch 'mesasVinculadas\.map') {
  throw 'La liberacion no contempla mesas vinculadas'
}

Write-Host 'Regla de liberacion post-pago verificada.' -ForegroundColor DarkGreen

Run-Step 'Backend build completo' {
  Push-Location (Join-Path $Root 'backend')
  try { npm run build } finally { Pop-Location }
}

Write-Host "`nSIGR S53 LIBERACION MESA POST-PAGO OK" -ForegroundColor Green
