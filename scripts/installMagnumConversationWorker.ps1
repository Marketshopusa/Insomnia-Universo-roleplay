$ErrorActionPreference = 'Stop'
$sourcePath = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $env:LOCALAPPDATA 'Insomnia'
$servicePath = Join-Path $statePath 'MagnumConversation'
$envPath = Join-Path $statePath 'magnum-conversation.env'
if (-not (Test-Path $envPath)) { throw 'La conexión privada de Magnum todavía no está configurada.' }
New-Item -ItemType Directory -Force -Path (Join-Path $servicePath 'scripts'),(Join-Path $servicePath 'api') | Out-Null
foreach ($file in @('scripts\magnumConversationWorker.mjs','api\_magnumProtocol.mjs','api\_magnumFormat.mjs','api\_config.mjs')) {
  Copy-Item (Join-Path $sourcePath $file) (Join-Path $servicePath $file) -Force
}
$metadata = Get-Content (Join-Path $sourcePath 'node_modules\@supabase\supabase-js\package.json') -Raw | ConvertFrom-Json
$package = @{ name = 'insomnia-magnum-conversation-worker'; private = $true; type = 'module'; dependencies = @{ '@supabase/supabase-js' = $metadata.version } }
$package | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $servicePath 'package.json') -Encoding utf8
Push-Location $servicePath
try {
  npm.cmd install --omit=dev --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias del servicio.' }
} finally { Pop-Location }
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*magnumConversationWorker.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId }
$nodePath = (Get-Command node.exe).Source
$workerPath = Join-Path $servicePath 'scripts\magnumConversationWorker.mjs'
$workerArguments = '--env-file="' + $envPath + '" "' + $workerPath + '"'
try {
  $userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $action = New-ScheduledTaskAction -Execute $nodePath -Argument $workerArguments -WorkingDirectory $servicePath
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
  $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Stop-ScheduledTask -TaskName 'InsomniaMagnumConversation' -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName 'InsomniaMagnumConversation' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Remove-Item (Join-Path $statePath 'magnum-conversation-worker.lock') -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName 'InsomniaMagnumConversation'
  Write-Output 'MAGNUM_AUTOSTART=scheduled-task'
} catch {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'Insomnia Magnum Conversation.lnk'))
  $shortcut.TargetPath = $nodePath
  $shortcut.Arguments = $workerArguments
  $shortcut.WorkingDirectory = $servicePath
  $shortcut.WindowStyle = 7
  $shortcut.Description = 'Conexión cifrada de Insomnia con Magnum para conversación no explícita'
  $shortcut.Save()
  Start-Process -FilePath $nodePath -ArgumentList $workerArguments -WorkingDirectory $servicePath -WindowStyle Hidden | Out-Null
  Write-Output 'MAGNUM_AUTOSTART=startup-shortcut'
}
