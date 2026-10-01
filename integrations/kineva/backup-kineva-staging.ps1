# Respaldo logico de solo lectura del Supabase compartido.
# Pide el host del Session pooler y la contrasena en la propia PC.
param([switch]$CheckOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRef = 'cexzmelshvbgabihtfvx'
$InstallDir = 'C:\Program Files\Blackmagic Design\DaVinci Resolve'
$PgTools = Join-Path $InstallDir 'PGTools'
$PgDump = Join-Path $PgTools 'pg_dump.exe'
$PgRestore = Join-Path $PgTools 'pg_restore.exe'
if (-not (Test-Path -LiteralPath $PgDump) -or -not (Test-Path -LiteralPath $PgRestore)) {
    throw 'No encuentro pg_dump y pg_restore en PGTools. No se ha creado ninguna copia.'
}

$OriginalPath = $env:PATH
$env:PATH = "$PgTools;$InstallDir;$OriginalPath"
$Password = $null
$TempPath = $null
$RemovePasswordOnExit = $false
try {
    if ($CheckOnly) {
        & $PgDump --version
        & $PgRestore --version
        if ($LASTEXITCODE -ne 0) { throw 'Las herramientas PostgreSQL no funcionan.' }
        Write-Host "Listo para respaldar $ProjectRef. Ejecuta sin -CheckOnly cuando tengas el host y la contrasena."
        return
    }

    if (Test-Path Env:PGPASSWORD) {
        throw 'Esta terminal ya tiene PGPASSWORD. Abre una ventana PowerShell nueva antes de continuar.'
    }
    Write-Host "Destino fijo: Supabase kineva-staging ($ProjectRef)."
    Write-Host 'En Supabase > kineva-staging > Connect, selecciona Session pooler (puerto 5432).'
    $PoolerHost = (Read-Host 'Pega solo el HOST del Session pooler (sin usuario ni contrasena)').Trim()
    if ($PoolerHost -notmatch '^[A-Za-z0-9.-]+\.pooler\.supabase\.com$') {
        throw 'Host no valido. Copia solamente el host del Session pooler desde Connect.'
    }
    $Password = Read-Host 'Contrasena de la base de datos de kineva-staging (oculta)' -AsSecureString
    if ($null -eq $Password -or $Password.Length -eq 0) { throw 'No se proporciono una contrasena.' }

    $PasswordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
    try {
        $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($PasswordPtr)
        $RemovePasswordOnExit = $true
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PasswordPtr)
    }

    $Connection = "host=$PoolerHost port=5432 dbname=postgres user=postgres.$ProjectRef sslmode=require connect_timeout=15"
    $Downloads = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
    $Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutputPath = Join-Path $Downloads "kineva-staging-$Stamp.backup"
    $TempPath = "$OutputPath.partial"
    if ((Test-Path -LiteralPath $OutputPath) -or (Test-Path -LiteralPath $TempPath)) {
        throw 'Ya existe un archivo con este nombre. Espera unos segundos y vuelve a ejecutar.'
    }

    Write-Host 'Creando copia de base de datos en Descargas...'
    & $PgDump "--dbname=$Connection" '--format=custom' "--file=$TempPath"
    if ($LASTEXITCODE -ne 0) { throw "pg_dump fallo (codigo $LASTEXITCODE)." }
    if (-not (Test-Path -LiteralPath $TempPath)) { throw 'pg_dump no creo el archivo.' }
    & $PgRestore --list $TempPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'El archivo creado no paso la verificacion pg_restore -l.' }
    Move-Item -LiteralPath $TempPath -Destination $OutputPath
    $TempPath = $null
    $Result = Get-Item -LiteralPath $OutputPath
    $Hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash
    Write-Host "Copia verificada: $($Result.FullName)"
    Write-Host "Bytes: $($Result.Length); SHA-256: $Hash"
    Write-Host 'Este archivo contiene datos sensibles. Conserva el original fuera de Git y del chat.'
    Write-Host 'Storage requiere copiar los archivos por separado; este respaldo guarda su metadata.'
} catch {
    if ($TempPath -and (Test-Path -LiteralPath $TempPath)) {
        Remove-Item -LiteralPath $TempPath -Force
    }
    throw
} finally {
    if ($RemovePasswordOnExit) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    if ($Password) { $Password.Dispose() }
    $env:PATH = $OriginalPath
}
