param(
  [string]$EnvPath = "backend/.env"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $EnvPath)) {
  throw "No existe $EnvPath. Crea el archivo de entorno antes de configurar el PIN."
}

$lines = Get-Content -LiteralPath $EnvPath
$jwtLine = $lines | Where-Object { $_ -match '^JWT_SECRET=' } | Select-Object -First 1
if (-not $jwtLine) {
  throw "JWT_SECRET no está configurado en $EnvPath."
}
$jwtSecret = ($jwtLine -replace '^JWT_SECRET=', '').Trim().Trim('"').Trim("'")
if ($jwtSecret.Length -lt 16) {
  throw "JWT_SECRET no parece válido."
}

$securePin = Read-Host "PIN privado de plataforma (6-12 dígitos)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePin)
try {
  $pin = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

if ($pin -notmatch '^\d{6,12}$') {
  throw "El PIN debe contener entre 6 y 12 dígitos."
}

$sha = [System.Security.Cryptography.SHA256]::Create()
try {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes("$jwtSecret`:$pin")
  $hashBytes = $sha.ComputeHash($bytes)
  $hash = ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
} finally {
  $sha.Dispose()
  $pin = $null
}

$replaced = $false
$output = foreach ($line in $lines) {
  if ($line -match '^PLATFORM_ADMIN_PIN_HASH=') {
    $replaced = $true
    "PLATFORM_ADMIN_PIN_HASH=$hash"
  } else {
    $line
  }
}
if (-not $replaced) {
  $output += ""
  $output += "PLATFORM_ADMIN_PIN_HASH=$hash"
}

Set-Content -LiteralPath $EnvPath -Value $output -Encoding UTF8
Write-Host "PIN privado configurado en $EnvPath (solo se guardó el hash)."
