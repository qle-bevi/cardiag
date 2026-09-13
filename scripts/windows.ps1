# Invoked by windows.sh; all tools here are native Windows executables.
param(
    [Parameter(Mandatory = $true)][string]$ProjectPath,
    [switch]$CheckOnly,
    [switch]$PrepareOnly,
    [switch]$Demo
)
$ErrorActionPreference = 'Stop'
try {
    # npm.cmd needs a Windows working directory, including during preflight.
    Set-Location $env:USERPROFILE
    foreach ($tool in @('node.exe', 'npm.cmd', 'cargo.exe', 'rustup.exe')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            throw "Outil Windows absent : $tool. Consultez les prerequis Windows du README."
        }
    }
    $nodeVersion = (& node.exe --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.') {
        throw "Node.js 24 est necessaire sous Windows (version trouvee : $nodeVersion)."
    }
    $npmVersion = (& npm.cmd --version).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Impossible de lancer npm sous Windows.' }
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Installez les Microsoft C++ Build Tools (x86/x64 et SDK Windows).' }
    $buildTools = & $vswhere -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($LASTEXITCODE -ne 0 -or -not $buildTools) { throw 'Les outils Visual C++ x86/x64 sont absents.' }
    Write-Host "Outils Windows disponibles : Node $nodeVersion, npm $npmVersion, Rust et Visual C++."
    Write-Host "Copie Windows : $ProjectPath"
    if ($CheckOnly) { exit 0 }

    Set-Location -LiteralPath $ProjectPath
    $env:CARGO_BUILD_JOBS = '2'
    # Avoid inheriting a Linux/cross-compilation target into the Windows build.
    Remove-Item Env:CARGO_BUILD_TARGET -ErrorAction SilentlyContinue
    Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
    if ($Demo) { $env:CARDIAG_DEMO = '1' } else { $env:CARDIAG_DEMO = '0' }

    $packageHash = (Get-FileHash -LiteralPath 'package.json' -Algorithm SHA256).Hash
    $lockHash = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash
    $fingerprint = "$packageHash/$lockHash/$nodeVersion/$npmVersion"
    $stamp = 'node_modules\.cardiag-wsl-dependencies'
    $installed = (Test-Path -LiteralPath 'node_modules\.bin\tauri.cmd') -and
        (Test-Path -LiteralPath $stamp) -and
        ((Get-Content -LiteralPath $stamp -Raw).Trim() -eq $fingerprint)
    if (-not $installed) {
        Write-Host 'Installation des dependances Windows...'
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci a echoue (code $LASTEXITCODE)." }
        Set-Content -LiteralPath $stamp -Value $fingerprint -Encoding ASCII
    } else {
        Write-Host 'Les dependances Windows sont deja a jour.'
    }
    if ($PrepareOnly) { Write-Host 'Copie Windows prete.'; exit 0 }
    Write-Host 'Compilation et lancement de Cardiag sous Windows (Ctrl+C pour arreter)...'
    & npm.cmd run tauri dev
    exit $LASTEXITCODE
} catch {
    Write-Host "Erreur : $_" -ForegroundColor Red
    exit 1
}
