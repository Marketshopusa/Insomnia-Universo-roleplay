param([switch]$NoBrowser)
$ErrorActionPreference = "Stop"
$project = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$server = Join-Path $PSScriptRoot "local_creator.py"
function Test-LocalEndpoint([string]$url) {
    try {
        $null = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
        return $true
    } catch { return $false }
}
if (-not (Test-LocalEndpoint "http://127.0.0.1:8188/system_stats")) {
    Start-Process powershell.exe -ArgumentList ('-NoExit -ExecutionPolicy Bypass -File "' +
        (Join-Path $PSScriptRoot "start-comfy.ps1") + '"') -WorkingDirectory $project
    Write-Host "Iniciando ComfyUI..."
}
if (-not (Test-LocalEndpoint "http://127.0.0.1:8787/health")) {
    Start-Process py -ArgumentList ('-3 -u "' + $server + '"') -WorkingDirectory $PSScriptRoot
    Write-Host "Iniciando Kineva local..."
}
if (-not (Test-LocalEndpoint "http://127.0.0.1:8080/")) {
    Start-Process npm.cmd -ArgumentList "run dev -- --host 127.0.0.1 --port 8080" -WorkingDirectory $project
    Write-Host "Iniciando Insomnia..."
}
if (-not $NoBrowser) {
    Start-Process "http://127.0.0.1:8080/studio/kineva-local"
}
Write-Host "Insomnia + Kineva: http://127.0.0.1:8080/studio/kineva-local"
