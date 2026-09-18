$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot

function Run-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Name fallo con codigo $LASTEXITCODE"
  }
}

Run-Step 'Frontend lint' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run lint -- --no-fix } finally { Pop-Location }
}

Run-Step 'Frontend prueba focalizada de configuracion de impresora' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run test:unit -- src/lib/print-agent.spec.ts } finally { Pop-Location }
}

Run-Step 'Frontend build' {
  Push-Location (Join-Path $Root 'frontend')
  try { npm run build } finally { Pop-Location }
}

Run-Step 'Backend build' {
  Push-Location (Join-Path $Root 'backend')
  try { npm run build } finally { Pop-Location }
}

Run-Step 'Agente de impresion - sintaxis' {
  Push-Location (Join-Path $Root 'print-agent')
  try { npm run check } finally { Pop-Location }
}

Run-Step 'Agente de impresion - UTF-8' {
  Push-Location (Join-Path $Root 'print-agent')
  try { npm run check:utf8 } finally { Pop-Location }
}

Write-Host "`n==> Deteccion opcional del agente local" -ForegroundColor Cyan
try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:38475/v1/health' -TimeoutSec 2
  if (-not $health.ok) { throw 'El agente respondio sin estado OK' }
  Write-Host "Agente: OK - $($health.service) $($health.version)" -ForegroundColor Green

  $printers = Invoke-RestMethod -Uri 'http://127.0.0.1:38475/v1/printers' -Headers @{ 'X-SIGR-Print-Agent' = '1' } -TimeoutSec 5
  $count = @($printers.printers).Count
  Write-Host "Impresoras detectadas: $count" -ForegroundColor Green
} catch {
  Write-Host 'Agente local no detectado. La puerta de software puede continuar; la prueba fisica queda pendiente.' -ForegroundColor Yellow
}

Write-Host "`nSIGR SPRINT 51 PUERTA SOFTWARE IMPRESION OK" -ForegroundColor Green
