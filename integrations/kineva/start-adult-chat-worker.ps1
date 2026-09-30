$ErrorActionPreference = 'Stop'
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
    Add-Content -Path $log -Value ('[' + (Get-Date).ToString('s') + '] launcher error: ' + $detail.Substring(0, [Math]::Min(180, $detail.Length)))
  } finally {
    Remove-Item Env:\SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 15
}
