param(
    [switch]$PreflightOnly,
    [switch]$Once
)

$ErrorActionPreference = "Stop"
$kinevaRepo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$kinevaActive = Join-Path $env:USERPROFILE "Documents\Kineva-Workflows\ACTIVE"
$kinevaShared = Join-Path $env:USERPROFILE "AppData\Local\Comfy-Desktop\ComfyUI-Shared"
$kinevaWorker = Join-Path $PSScriptRoot "worker.py"
$kinevaArgs = @(
    $kinevaWorker,
    "--workflow-api", (Join-Path $kinevaActive "KINEVA_MINISERIES_API_TEMPLATE.json"),
    "--input-dir", (Join-Path $kinevaShared "input"),
    "--output-dir", (Join-Path $kinevaShared "output")
)

& py -3 @kinevaArgs --preflight
if ($LASTEXITCODE -ne 0) {
    throw "ComfyUI preflight failed. Restart ComfyUI and check the Kineva nodes."
}
if ($PreflightOnly) { return }

if (-not $env:SUPABASE_URL) {
    $kinevaEnvLine = Get-Content (Join-Path $kinevaRepo ".env") |
        Where-Object { $_ -match "^VITE_SUPABASE_URL=" } |
        Select-Object -First 1
    if (-not $kinevaEnvLine) { throw "Missing public Supabase URL in .env." }
    $env:SUPABASE_URL = ($kinevaEnvLine -replace "^VITE_SUPABASE_URL=", "").Trim().Trim('"', "'")
}
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
    $kinevaSecureKey = Read-Host "Supabase service_role key for the local worker" -AsSecureString
    $kinevaPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($kinevaSecureKey)
    try {
        $env:SUPABASE_SERVICE_ROLE_KEY =
            [Runtime.InteropServices.Marshal]::PtrToStringBSTR($kinevaPointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($kinevaPointer)
    }
}
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) { throw "A local worker key is required." }

if ($Once) { $kinevaArgs += "--once" }
try {
    & py -3 @kinevaArgs
    if ($LASTEXITCODE -ne 0) { throw "Kineva worker exited with an error." }
} finally {
    Remove-Item Env:\SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
}
