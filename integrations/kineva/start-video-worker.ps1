$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$logDir = Join-Path $env:LOCALAPPDATA 'Kineva'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir 'video-worker-task.log'
$bunx = Join-Path $env:USERPROFILE '.bun\bin\bunx.exe'
$python = Join-Path $env:WINDIR 'py.exe'
$worker = Join-Path $PSScriptRoot 'worker.py'
$shared = Join-Path $env:LOCALAPPDATA 'Comfy-Desktop\ComfyUI-Shared'
$workflow = Join-Path $env:USERPROFILE 'Documents\Kineva-Workflows\ACTIVE\KINEVA_MINISERIES_API_TEMPLATE.json'
$env:SUPABASE_URL = 'https://cexzmelshvbgabihtfvx.supabase.co'
Set-Location $repo
while ($true) {
  try {
    if (-not (Test-Path $workflow)) { throw 'Kineva API workflow missing' }
    $keysText = & $bunx supabase projects api-keys --project-ref cexzmelshvbgabihtfvx --reveal --output json
    if ($LASTEXITCODE -ne 0) { throw 'Supabase CLI credentials unavailable' }
    $keys = ConvertFrom-Json -InputObject ($keysText -join [Environment]::NewLine)
    $key = ($keys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1).api_key
    if (-not $key) { throw 'Supabase service role key unavailable' }
    $env:SUPABASE_SERVICE_ROLE_KEY = $key
    Remove-Variable key, keys, keysText -ErrorAction SilentlyContinue
    & $python -3 -u $worker --workflow-api $workflow --input-dir (Join-Path $shared 'input') --output-dir (Join-Path $shared 'output') *>> $log
  } catch {
    $detail = $_.Exception.Message
    if ($env:SUPABASE_SERVICE_ROLE_KEY) { $detail = $detail.Replace($env:SUPABASE_SERVICE_ROLE_KEY, '[redacted]') }
    Add-Content -Path $log -Value ('[' + (Get-Date).ToString('s') + '] launcher error: ' + $_.Exception.GetType().Name + ' ' + $detail.Substring(0, [Math]::Min(180, $detail.Length)))
  } finally {
    Remove-Item Env:\SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 20
}
