param(
  [Parameter(Mandatory = $true)][string]$BaseUrl,
  [Parameter(Mandatory = $true)][string]$PublishToken,
  [string]$EnvFile = ".\deploy\node\.env"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $EnvFile)) {
  throw "No existe $EnvFile. Configura primero el nodo EDGE."
}
if ($BaseUrl -notmatch '^https://') {
  throw 'PUBLIC_MENU_BASE_URL debe usar HTTPS.'
}
if ($PublishToken.Length -lt 32) {
  throw 'El token de publicación debe tener al menos 32 caracteres.'
}

$BaseUrl = $BaseUrl.TrimEnd('/')
$content = Get-Content -Raw -Path $EnvFile

function Set-EnvValue([string]$Text, [string]$Name, [string]$Value) {
  $escapedName = [Regex]::Escape($Name)
  if ($Text -match "(?m)^$escapedName=") {
    return [Regex]::Replace($Text, "(?m)^$escapedName=.*$", "$Name=$Value")
  }
  if (-not $Text.EndsWith("`n")) { $Text += "`r`n" }
  return $Text + "$Name=$Value`r`n"
}

$content = Set-EnvValue $content 'PUBLIC_MENU_BASE_URL' $BaseUrl
$content = Set-EnvValue $content 'PUBLIC_MENU_PUBLISH_TOKEN' $PublishToken
$content = Set-EnvValue $content 'PUBLIC_MENU_INTERVAL_MS' '60000'

Set-Content -Path $EnvFile -Value $content -Encoding utf8
Write-Host "Menú público EDGE configurado: $BaseUrl" -ForegroundColor Green
Write-Host 'El secreto quedó únicamente en deploy/node/.env (ignorado por Git).'
Write-Host 'Reinicia SIGR con docker compose --env-file .\deploy\node\.env -f .\docker-compose.node.yml up -d --build'
