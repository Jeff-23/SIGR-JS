$ErrorActionPreference = 'Stop'
$edge = 'http://localhost:8080/api'
$cloud = 'http://localhost:8081/api'
$envFile = Join-Path $PSScriptRoot '..\deploy\sync\.env.smoke'
$certKey = $null
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^SYNC_CERT_KEY=' } | Select-Object -First 1
  if ($line) { $certKey = ($line -split '=',2)[1].Trim() }
}
if (-not $certKey) { throw 'No se encontro SYNC_CERT_KEY en deploy\sync\.env.smoke' }
$headers = @{ 'x-sigr-cert-key' = $certKey }
function PostJson($url, $body) { Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 20) }
function GetJson($url) { Invoke-RestMethod -Method Get -Uri $url -Headers $headers }
function New-Id { [guid]::NewGuid().ToString() }
$ids = [ordered]@{
  restauranteGlobalId = New-Id
  sucursalGlobalId = New-Id
  usuarioGlobalId = New-Id
}
function StatusUrl($base) {
  return "$base/sync/internal/certification/security/status?restauranteGlobalId=$($ids.restauranteGlobalId)&sucursalGlobalId=$($ids.sucursalGlobalId)&usuarioGlobalId=$($ids.usuarioGlobalId)"
}
Write-Host '[1/9] Preparando restaurante, sucursal, rol y permisos en EDGE y CLOUD...'
PostJson "$edge/sync/internal/certification/security/setup" $ids | Out-Null
PostJson "$cloud/sync/internal/certification/security/setup" $ids | Out-Null
Write-Host '[2/9] Simulando Cloud fuera de linea...'
try { docker stop sigr-cloud-smoke-gateway-1 | Out-Null } catch {}
Start-Sleep -Seconds 1
Write-Host '[3/9] Creando usuario de sucursal en EDGE sin Cloud...'
$created = PostJson "$edge/sync/internal/certification/security/create-edge-flow" $ids
if ($created.eventos -lt 1) { throw 'EDGE no genero evento de usuario.' }
Write-Host '[4/9] Recuperando Cloud y sincronizando usuario EDGE -> CLOUD...'
try { docker start sigr-cloud-smoke-gateway-1 | Out-Null } catch {}
Start-Sleep -Seconds 2
$cloudState = $null
for ($i=0; $i -lt 30; $i++) {
  PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null
  Start-Sleep -Milliseconds 500
  $cloudState = GetJson (StatusUrl $cloud)
  if ($cloudState.usuario -and $cloudState.usuario.activo -eq $true -and $cloudState.usuario.passwordEdge -eq $true) { break }
}
Write-Host '[5/9] Verificando usuario y rol en CLOUD...'
if (-not $cloudState.usuario) { throw 'Usuario EDGE->CLOUD no llego.' }
if ($cloudState.usuario.sucursalGlobalId -ne $ids.sucursalGlobalId) { throw 'Usuario quedo en otra sucursal.' }
if ($cloudState.usuario.passwordEdge -ne $true) { throw 'Hash de credencial EDGE no converge en CLOUD.' }
if (@($cloudState.rol.permisos).Count -ne 1 -or $cloudState.rol.permisos[0] -ne 'SYNC48D2F_VIEW') { throw 'Permisos iniciales del rol no son correctos.' }
Write-Host '[6/9] Reencolando usuario para probar idempotencia...'
PostJson "$edge/sync/internal/certification/security/requeue" $ids | Out-Null
for ($i=0; $i -lt 5; $i++) { PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null; Start-Sleep -Milliseconds 350 }
$cloudAgain = GetJson (StatusUrl $cloud)
if (-not $cloudAgain.usuario -or $cloudAgain.usuario.globalId -ne $ids.usuarioGlobalId) { throw 'Reenvio altero la identidad distribuida del usuario.' }
Write-Host '[7/9] Revocando usuario, cambiando credencial y permisos en CLOUD...'
$change = PostJson "$cloud/sync/internal/certification/security/update-cloud" $ids
if ($change.eventos.usuario -lt 1 -or $change.eventos.rol -lt 1) { throw 'CLOUD no genero eventos de seguridad hacia EDGE.' }
Write-Host '[8/9] EDGE hace pull + ACK...'
$edgeState = $null
for ($i=0; $i -lt 30; $i++) {
  PostJson "$edge/sync/internal/certification/cycle" @{} | Out-Null
  Start-Sleep -Milliseconds 500
  $edgeState = GetJson (StatusUrl $edge)
  $perms = @($edgeState.rol.permisos)
  if ($edgeState.usuario -and $edgeState.usuario.activo -eq $false -and $edgeState.usuario.nombres -eq 'Usuario CLOUD 48D2F' -and $edgeState.usuario.passwordCloud -eq $true -and $perms.Count -eq 2) { break }
}
Write-Host '[9/9] Verificando revocacion, credencial y permisos convergentes...'
$cloudFinal = GetJson (StatusUrl $cloud)
if ($edgeState.usuario.activo -ne $false -or $cloudFinal.usuario.activo -ne $false) { throw 'Revocacion de usuario no converge.' }
if ($edgeState.usuario.passwordCloud -ne $true -or $cloudFinal.usuario.passwordCloud -ne $true) { throw 'Cambio de credencial no converge.' }
if ($edgeState.usuario.passwordEdge -ne $false) { throw 'EDGE conserva la credencial anterior.' }
$edgePerms = @($edgeState.rol.permisos | Sort-Object)
$cloudPerms = @($cloudFinal.rol.permisos | Sort-Object)
if (($edgePerms -join ',') -ne 'SYNC48D2F_MANAGE,SYNC48D2F_VIEW' -or ($cloudPerms -join ',') -ne 'SYNC48D2F_MANAGE,SYNC48D2F_VIEW') { throw 'Permisos del rol no convergen.' }
Write-Host ''
Write-Host 'SIGR SYNC 48D-2F OK' -ForegroundColor Green
Write-Host "Usuario: $($ids.usuarioGlobalId)"
Write-Host 'Usuario, rol, permisos, credencial bcrypt, revocacion, reenvio idempotente y flujo bidireccional certificados.'
