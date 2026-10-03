$ErrorActionPreference = 'Stop'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
$TaskName = 'SIGR Print Agent'
$StartupCmd = Join-Path ([Environment]::GetFolderPath('Startup')) 'SIGR Print Agent.cmd'
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $StartupCmd -Force -ErrorAction SilentlyContinue
Write-Host 'Agente de impresión de SIGR eliminado del inicio automático.'
