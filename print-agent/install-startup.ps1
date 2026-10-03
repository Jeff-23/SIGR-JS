$ErrorActionPreference = 'Stop'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Node = (Get-Command node.exe -ErrorAction Stop).Source
$TaskName = 'SIGR Print Agent'
$StartupDir = [Environment]::GetFolderPath('Startup')
$StartupCmd = Join-Path $StartupDir 'SIGR Print Agent.cmd'

function Test-SigrPrintAgent {
  try {
    $response = Invoke-RestMethod -Uri 'http://127.0.0.1:38475/v1/health' -TimeoutSec 2
    return [bool]$response.ok
  } catch {
    return $false
  }
}

function Start-SigrPrintAgentNow {
  if (Test-SigrPrintAgent) { return }
  Start-Process -FilePath $Node -ArgumentList 'server.js' -WorkingDirectory $AgentDir -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(6)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 300
    if (Test-SigrPrintAgent) { return }
  }
  throw 'El agente fue configurado, pero no respondió en http://127.0.0.1:38475. Revisa si otro proceso usa ese puerto.'
}

$installedWithTask = $false
try {
  $Action = New-ScheduledTaskAction -Execute $Node -Argument 'server.js' -WorkingDirectory $AgentDir
  $Trigger = New-ScheduledTaskTrigger -AtLogOn
  $UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $Principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Description 'Agente local de impresión térmica de SIGR' -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  $installedWithTask = $true
} catch [System.UnauthorizedAccessException] {
  $installedWithTask = $false
} catch {
  if ($_.Exception.Message -match 'Acceso denegado|Access is denied|0x80070005') {
    $installedWithTask = $false
  } else {
    throw
  }
}

if (-not $installedWithTask) {
  $nodeEscaped = $Node.Replace('"', '""')
  $dirEscaped = $AgentDir.Replace('"', '""')
  $cmd = "@echo off`r`ncd /d `"$dirEscaped`"`r`nstart `"SIGR Print Agent`" /min `"$nodeEscaped`" server.js`r`n"
  [System.IO.File]::WriteAllText($StartupCmd, $cmd, [System.Text.Encoding]::ASCII)
}

Start-SigrPrintAgentNow

if ($installedWithTask) {
  Write-Host "Agente de impresión de SIGR instalado e iniciado. Inicio automático: Tarea de Windows '$TaskName'."
} else {
  Write-Host "Agente de impresión de SIGR instalado e iniciado sin privilegios administrativos. Inicio automático: carpeta Inicio de Windows."
  Write-Host "Archivo: $StartupCmd"
}
Write-Host 'Diagnóstico: http://127.0.0.1:38475/v1/health'
