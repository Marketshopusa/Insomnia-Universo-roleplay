param([switch]$NoBrowser)
$ErrorActionPreference = "Stop"
$project = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$server = Join-Path $PSScriptRoot "local_creator.py"
function Test-LocalEndpoint([string]$url) {
    try {
        $null = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
        return $true
    } catch {
        # 503 still means the process is listening (worker up, ComfyUI not ready yet).
        if ($_.Exception.Response) { return $true }
        return $false
    }
}
function Wait-LocalEndpoint([string]$url, [int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    do {
        if (Test-LocalEndpoint $url) { return $true }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    return (Test-LocalEndpoint $url)
}
if (-not (Test-LocalEndpoint "http://127.0.0.1:8188/system_stats")) {
    Start-Process powershell.exe -ArgumentList ('-NoExit -ExecutionPolicy Bypass -File "' +
        (Join-Path $PSScriptRoot "start-comfy.ps1") + '"') -WorkingDirectory $project
    Write-Host "Iniciando ComfyUI..."
}
if (-not (Wait-LocalEndpoint "http://127.0.0.1:8188/system_stats" 90)) {
    Write-Host "ComfyUI no respondió en el puerto 8188."
}
if (-not (Test-LocalEndpoint "http://127.0.0.1:8787/health")) {
    Start-Process py -ArgumentList ('-3 -u "' + $server + '"') -WorkingDirectory $PSScriptRoot
    Write-Host "Iniciando Kineva local..."
}
if (-not (Wait-LocalEndpoint "http://127.0.0.1:8787/health" 30)) {
    Write-Host "El worker de Kineva no respondió en el puerto 8787."
}
if (-not (Test-LocalEndpoint "http://127.0.0.1:8080/")) {
    Start-Process npm.cmd -ArgumentList "run dev -- --host 127.0.0.1 --port 8080" -WorkingDirectory $project
    Write-Host "Iniciando Insomnia..."
}
if (-not $NoBrowser) {
    Start-Process "http://127.0.0.1:8080/studio"
}
Write-Host "Insomnia + Kineva: http://127.0.0.1:8080/studio"
