$ErrorActionPreference = 'Stop'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Node = (Get-Command node.exe -ErrorAction Stop).Source
$TaskName = 'SIGR Print Agent'
$Action = New-ScheduledTaskAction -Execute $Node -Argument 'server.js' -WorkingDirectory $AgentDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$Principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Description 'Agente local de impresión térmica de SIGR' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Agente de impresión de SIGR instalado e iniciado. Tarea de Windows: $TaskName"
