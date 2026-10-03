param(
  [Parameter(Mandatory=$true)][ValidateSet('list','status','print')][string]$Operation,
  [string]$PrinterName = '',
  [string]$FilePath = '',
  [string]$JobName = 'SIGR',
  [ValidateSet(58,80)][int]$WidthMm = 80,
  [int]$TimeoutSeconds = 12
)

$ErrorActionPreference = 'Stop'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

function Get-SigrPrinter([string]$Name) {
  $escaped = $Name.Replace("'", "''")
  return Get-CimInstance Win32_Printer -Filter "Name='$escaped'" -ErrorAction Stop
}

function Convert-Printer([object]$Printer) {
  $errorState = if ($null -eq $Printer.DetectedErrorState) { 0 } else { [int]$Printer.DetectedErrorState }
  $statusCode = if ($null -eq $Printer.PrinterStatus) { 0 } else { [int]$Printer.PrinterStatus }
  $offline = [bool]$Printer.WorkOffline -or $statusCode -eq 7
  $stopped = $statusCode -eq 6
  $hardError = $errorState -ge 4
  $available = -not $offline -and -not $stopped -and -not $hardError
  $message = if ($offline) { 'Impresora desconectada o apagada' } elseif ($stopped) { 'La impresora está pausada o detenida' } elseif ($hardError) { "Windows informó un error de impresora (código $errorState)" } else { 'Disponible' }
  [pscustomobject]@{
    name = [string]$Printer.Name
    default = [bool]$Printer.Default
    network = [bool]$Printer.Network
    workOffline = [bool]$Printer.WorkOffline
    printerStatus = $statusCode
    detectedErrorState = $errorState
    available = $available
    message = $message
  }
}

if ($Operation -eq 'list') {
  $items = @(Get-CimInstance Win32_Printer | Sort-Object @{Expression='Default';Descending=$true}, Name | ForEach-Object { Convert-Printer $_ })
  $items | ConvertTo-Json -Compress -Depth 4
  exit 0
}

if ([string]::IsNullOrWhiteSpace($PrinterName)) { throw 'Debes indicar la impresora que deseas utilizar' }
$printer = Get-SigrPrinter $PrinterName
$info = Convert-Printer $printer

if ($Operation -eq 'status') {
  $info | ConvertTo-Json -Compress -Depth 4
  exit 0
}

if (-not $info.available) {
  [pscustomobject]@{ ok=$false; status='offline'; error=$info.message; printer=$info } | ConvertTo-Json -Compress -Depth 5
  exit 2
}
if ([string]::IsNullOrWhiteSpace($FilePath) -or -not (Test-Path -LiteralPath $FilePath)) { throw 'No se encontró el contenido que se iba a imprimir' }

Add-Type -AssemblyName System.Drawing
$content = Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8
$lines = $content -split "`r?`n"
$printDoc = New-Object System.Drawing.Printing.PrintDocument
$printDoc.PrinterSettings.PrinterName = $PrinterName
$printDoc.DocumentName = $JobName
if (-not $printDoc.PrinterSettings.IsValid) { throw 'La impresora seleccionada no es válida para Windows' }
$printDoc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(5,5,5,5)
$fontSize = if ($WidthMm -eq 58) { 8.2 } else { 9.0 }
$font = New-Object System.Drawing.Font('Consolas', $fontSize, [System.Drawing.FontStyle]::Regular)
$brush = [System.Drawing.Brushes]::Black
$index = 0

$handler = [System.Drawing.Printing.PrintPageEventHandler]{
  param($sender, $e)
  $lineHeight = [Math]::Ceiling($font.GetHeight($e.Graphics) + 1)
  $y = [float]$e.MarginBounds.Top
  while ($index -lt $lines.Count -and ($y + $lineHeight) -le $e.MarginBounds.Bottom) {
    $e.Graphics.DrawString([string]$lines[$index], $font, $brush, [float]$e.MarginBounds.Left, $y)
    $script:index++
    $y += $lineHeight
  }
  $e.HasMorePages = $index -lt $lines.Count
}
$printDoc.add_PrintPage($handler)

$before = @{}
try { Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue | ForEach-Object { $before[[int]$_.ID] = $true } } catch {}
try {
  $printDoc.Print()
} finally {
  $printDoc.remove_PrintPage($handler)
  $font.Dispose()
  $printDoc.Dispose()
}

$deadline = (Get-Date).AddSeconds([Math]::Max(2, [Math]::Min($TimeoutSeconds, 4)))
$observed = $false
$observedAt = $null
Start-Sleep -Milliseconds 120
while ((Get-Date) -lt $deadline) {
  $jobs = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue | Where-Object { -not $before.ContainsKey([int]$_.ID) })
  if ($jobs.Count -gt 0) {
    $observed = $true
    if ($null -eq $observedAt) { $observedAt = Get-Date }
    $bad = $jobs | Where-Object { ([string]$_.JobStatus) -match 'Error|Offline|PaperOut|Blocked|UserIntervention|Deleted' }
    if ($bad) {
      $jobs | Remove-PrintJob -ErrorAction SilentlyContinue
      [pscustomobject]@{ ok=$false; status='error'; error='Windows reportó un error en la cola; el trabajo fue cancelado'; printer=$PrinterName } | ConvertTo-Json -Compress
      exit 3
    }
    # Para una térmica local no esperamos a que Windows retire el trabajo de la
    # cola: una vez aceptado y estable durante ~0.7 s, devolvemos control a SIGR.
    if (((Get-Date) - $observedAt).TotalMilliseconds -ge 700) {
      [pscustomobject]@{ ok=$true; status='submitted'; printer=$PrinterName; jobName=$JobName } | ConvertTo-Json -Compress
      exit 0
    }
  } elseif ($observed) {
    [pscustomobject]@{ ok=$true; status='completed'; printer=$PrinterName; jobName=$JobName } | ConvertTo-Json -Compress
    exit 0
  }
  Start-Sleep -Milliseconds 150
}

# Algunas colas térmicas entran y salen antes del primer sondeo. Si Windows
# mantiene la impresora disponible después de Print(), consideramos el trabajo
# entregado al spooler, sin afirmar que el papel fue verificado físicamente.
$latest = Convert-Printer (Get-SigrPrinter $PrinterName)
if ($latest.available) {
  [pscustomobject]@{ ok=$true; status='submitted'; printer=$PrinterName; jobName=$JobName; fastSpool=$true } | ConvertTo-Json -Compress
  exit 0
}

[pscustomobject]@{ ok=$false; status='timeout'; error='Windows no confirmó que el trabajo entrara a la cola de impresión'; printer=$PrinterName } | ConvertTo-Json -Compress
exit 4
