param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "Comfy-Desktop\ComfyUI-Installs\Synthetic DL"),
    [string]$LlamaServer = "",
    [string]$ExtraModelPathsConfig = "",
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$comfyPython = Join-Path $InstallRoot "ComfyUI\.venv\Scripts\python.exe"
$comfyMain = Join-Path $InstallRoot "ComfyUI\main.py"
$shared = Join-Path $env:LOCALAPPDATA "Comfy-Desktop\ComfyUI-Shared"

foreach ($required in @($comfyPython, $comfyMain)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "ComfyUI file missing: $required"
    }
}
foreach ($required in @((Join-Path $shared "input"), (Join-Path $shared "output"))) {
    if (-not (Test-Path -LiteralPath $required -PathType Container)) {
        throw "ComfyUI directory missing: $required"
    }
}
if (-not $LlamaServer) {
    $llamaCommand = Get-Command "llama-server.exe" -ErrorAction SilentlyContinue
    if (-not $llamaCommand) {
        throw "llama-server.exe is missing from PATH. Set -LlamaServer to its local executable."
    }
    $LlamaServer = $llamaCommand.Source
}
if (-not (Test-Path -LiteralPath $LlamaServer -PathType Leaf)) {
    throw "llama-server.exe not found: $LlamaServer"
}
if (-not $ExtraModelPathsConfig) {
    $configsDir = Join-Path $env:APPDATA "Comfy Desktop\instance-model-paths"
    $configs = @(Get-ChildItem -LiteralPath $configsDir -Filter "inst-*.yaml" -File)
    if ($configs.Count -ne 1) {
        throw "Select a Comfy Desktop model paths YAML with -ExtraModelPathsConfig."
    }
    $ExtraModelPathsConfig = $configs[0].FullName
}
if (-not (Test-Path -LiteralPath $ExtraModelPathsConfig -PathType Leaf)) {
    throw "Model paths YAML missing: $ExtraModelPathsConfig"
}
if ($CheckOnly) {
    Write-Host "Kineva ComfyUI launcher ready; llama-server and model paths found."
    return
}

$portCheck = New-Object System.Net.Sockets.TcpClient
try {
    try {
        $portCheck.Connect("127.0.0.1", 8188)
    } catch {
        $cause = $_.Exception
        while ($cause.InnerException) { $cause = $cause.InnerException }
        if ($cause -isnot [System.Net.Sockets.SocketException]) { throw }
    }
    if ($portCheck.Connected) {
        throw "ComfyUI already listens on port 8188. Stop it only after its queue is empty."
    }
} finally {
    $portCheck.Dispose()
}

$previousLlamaServer = $env:MSB_LLAMA_SERVER
$env:MSB_LLAMA_SERVER = (Resolve-Path -LiteralPath $LlamaServer).Path
$comfyArgs = @(
    "-s", ".\ComfyUI\main.py",
    "--feature-flag", "show_signin_button=true",
    "--feature-flag", "enable_telemetry=true",
    "--enable-manager",
    "--extra-model-paths-config", $ExtraModelPathsConfig,
    "--input-directory", (Join-Path $shared "input"),
    "--output-directory", (Join-Path $shared "output")
)
Push-Location -LiteralPath $InstallRoot
try {
    & $comfyPython @comfyArgs
    if ($LASTEXITCODE -ne 0) { throw "ComfyUI exited with code $LASTEXITCODE." }
} finally {
    Pop-Location
    if ($null -eq $previousLlamaServer) {
        Remove-Item Env:\MSB_LLAMA_SERVER -ErrorAction SilentlyContinue
    } else {
        $env:MSB_LLAMA_SERVER = $previousLlamaServer
    }
}
