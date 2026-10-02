$ErrorActionPreference = 'Stop'
$script:chatMutex = New-Object System.Threading.Mutex($false, 'Local\InsomniaAdultChatWorker')
$chatOwned = $false
try {
  $chatOwned = $script:chatMutex.WaitOne(0)
} catch [System.Threading.AbandonedMutexException] {
  $chatOwned = $true
}
if (-not $chatOwned) {
  Write-Host 'El chat seguia abierto con el codigo viejo. Cierro ese proceso para que cargue este.'
  Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine -match 'adult_chat_worker\.py'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
  try { $chatOwned = $script:chatMutex.WaitOne(4000) } catch [System.Threading.AbandonedMutexException] { $chatOwned = $true }
}
if (-not $chatOwned) {
  Write-Host 'La ventana anterior sigue abierta y va a reabrir el chat con el codigo de esta carpeta. Espera 20 segundos. No abras otra ventana.'
  return
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$logDir = Join-Path $env:LOCALAPPDATA 'Kineva'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir 'adult-chat-worker.log'
$llamaLog = Join-Path $logDir 'adult-chat-llama.log'
$bunx = Join-Path $env:USERPROFILE '.bun\bin\bunx.exe'
$python = Join-Path $env:WINDIR 'py.exe'
$worker = Join-Path $PSScriptRoot 'adult_chat_worker.py'
$exe = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\ggml.llamacpp_Microsoft.Winget.Source_8wekyb3d8bbwe\llama-server.exe'
$model = Join-Path $env:LOCALAPPDATA 'Comfy-Desktop\ComfyUI-Shared\models\LLM\magnum-v4-12b\magnum-v4-12b-Q4_K_M.gguf'
$env:SUPABASE_URL = 'https://cexzmelshvbgabihtfvx.supabase.co'
Set-Location $repo
$videoScript = Join-Path $PSScriptRoot 'start-video-worker.ps1'
$videoWorker = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -like '*worker.py*' -and $_.CommandLine -notlike '*image_worker.py*' -and $_.CommandLine -notlike '*adult_chat_worker.py*' }
if (-not $videoWorker) {
  Start-Process powershell.exe -ArgumentList ('-NoExit -ExecutionPolicy Bypass -File "' + $videoScript + '"') -WorkingDirectory $repo
  Write-Host 'Iniciando el video de novelas y series en ComfyUI...'
}
$imageScript = Join-Path $PSScriptRoot 'start-image-worker.ps1'
$imageWorker = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -like '*image_worker.py*' }
if (-not $imageWorker) {
  Start-Process powershell.exe -ArgumentList ('-NoExit -ExecutionPolicy Bypass -File "' + $imageScript + '"') -WorkingDirectory $repo
  Write-Host 'Iniciando ilustraciones de escena en ComfyUI...'
}
while ($true) {
  try {
    if (-not (Test-Path $exe) -or -not (Test-Path $model)) { throw 'Local chat model or llama-server missing' }
    $healthy = $false
    try { $healthy = (Invoke-RestMethod -Uri 'http://127.0.0.1:8788/health' -TimeoutSec 2).status -eq 'ok' } catch { }
    if (-not $healthy) {
      Start-Process -FilePath $exe -ArgumentList @('-m',('"' + $model + '"'),'--host','127.0.0.1','--port','8788','-c','4096','-ngl','99','--no-webui') -WindowStyle Hidden -RedirectStandardOutput $llamaLog -RedirectStandardError (Join-Path $logDir 'adult-chat-llama-error.log')
      for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 2
        try { if ((Invoke-RestMethod -Uri 'http://127.0.0.1:8788/health' -TimeoutSec 2).status -eq 'ok') { $healthy = $true; break } } catch { }
      }
      if (-not $healthy) { throw 'Local chat server did not become ready' }
    }
    $keysText = & $bunx supabase projects api-keys --project-ref cexzmelshvbgabihtfvx --reveal --output json
    if ($LASTEXITCODE -ne 0) { throw 'Supabase CLI credentials unavailable' }
    $keys = ConvertFrom-Json -InputObject ($keysText -join [Environment]::NewLine)
    $key = ($keys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1).api_key
    if (-not $key) { throw 'Supabase service role key unavailable' }
    $env:SUPABASE_SERVICE_ROLE_KEY = $key
    Remove-Variable key, keys, keysText -ErrorAction SilentlyContinue
    $ErrorActionPreference = 'Continue'
    & $python -3 -u $worker *>> $log
    $workerExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($workerExit -ne 0) { throw ('Chat worker exited with code ' + $workerExit) }
  } catch {
    $detail = $_.Exception.Message
    if ($env:SUPABASE_SERVICE_ROLE_KEY) { $detail = $detail.Replace($env:SUPABASE_SERVICE_ROLE_KEY, '[redacted]') }
    $line = '[' + (Get-Date).ToString('s') + '] launcher error: ' + $detail.Substring(0, [Math]::Min(180, $detail.Length))
    Write-Host $line
    try { Add-Content -Path $log -Value $line -ErrorAction Stop } catch { }
  } finally {
    Remove-Item Env:\SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 15
}
