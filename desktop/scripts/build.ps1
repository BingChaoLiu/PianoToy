#requires -Version 5.0
<#
.SYNOPSIS
    Build Piano Visualizer installers (NSIS .exe + MSI .msi).

.DESCRIPTION
    Wraps the full Tauri build pipeline with the workspace gotchas already
    baked in:
      - prepends %USERPROFILE%\.cargo\bin to PATH so cargo is reachable
        in fresh shells
      - kills any running app.exe so it can't lock the output binary
        (avoids "failed to remove app.exe, os error 5")
      - tolerates stderr noise from cargo / node / vitest (no false
        NativeCommandError termination)
      - runs `npm test` first by default to avoid packaging regressions
      - lists final artifacts with size + path

.PARAMETER Bundles
    Which Tauri bundle formats to produce. Default: nsis,msi.

.PARAMETER SkipTests
    Skip `npm test` before building.

.PARAMETER SkipFrontend
    Skip the standalone `npm run build`. Tauri's beforeBuildCommand still
    runs it, so this only saves the duplicate build at the very start.

.PARAMETER Clean
    Run `cargo clean` first (full Rust rebuild, slow).

.PARAMETER NoKill
    Don't try to stop a running app.exe.

.EXAMPLE
    .\scripts\build.ps1
    .\scripts\build.ps1 -Bundles nsis
    .\scripts\build.ps1 -SkipTests -Clean
#>

[CmdletBinding()]
param(
    [ValidateSet('nsis', 'msi', 'app', 'deb', 'rpm', 'appimage', 'updater')]
    [string[]]$Bundles = @('nsis', 'msi'),
    [switch]$SkipTests,
    [switch]$SkipFrontend,
    [switch]$Clean,
    [switch]$NoKill
)

# 'Continue' so native commands can write to stderr (cargo/node warnings)
# without PowerShell turning it into a terminating NativeCommandError. We
# check $LASTEXITCODE ourselves.
$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

function Info($m) { Write-Host "[build] $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[build] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[build] $m" -ForegroundColor Yellow }
function Fail($m) {
    Write-Host "[build] $m" -ForegroundColor Red
    exit 1
}

# 0. PATH: cargo must be reachable
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
    if (Test-Path $cargoBin) {
        $env:PATH = "$cargoBin;$env:PATH"
        Info "Prepended $cargoBin to PATH"
    } else {
        Fail "cargo not on PATH and $cargoBin missing. Install Rust (https://rustup.rs) first."
    }
}
Info "cargo -> $((Get-Command cargo).Source)"

# 1. Stop a running app.exe so the build doesn't fail with os error 5
if (-not $NoKill) {
    $running = Get-Process -Name app -ErrorAction SilentlyContinue
    if ($running) {
        Warn "Stopping running app.exe (PID $($running.Id -join ','))"
        $running | Stop-Process -Force
        Start-Sleep -Seconds 1
    }
}

# 2. Sanity checks
if (-not (Test-Path 'package.json'))         { Fail 'package.json not found' }
if (-not (Test-Path 'src-tauri/Cargo.toml')) { Fail 'src-tauri/Cargo.toml not found' }
if (-not (Test-Path 'node_modules')) {
    Info 'node_modules missing, running npm install...'
    $null = & npm install 2>&1
    if ($LASTEXITCODE -ne 0) { Fail 'npm install failed' }
}

# 3. Tests
if (-not $SkipTests) {
    Info 'Running tests (npm test --run)...'
    $testOut = & npm test -- --run 2>&1
    $testExit = $LASTEXITCODE
    $testOut | Select-String 'Test Files|Tests +' |
        ForEach-Object { Write-Host "  $($_.Line.Trim())" }
    if ($testExit -ne 0) { Fail "Tests failed (exit $testExit). Re-run with -SkipTests to bypass." }
    Ok "Tests passed."
}

# 4. Optional clean
if ($Clean) {
    Info 'cargo clean (slow, full Rust rebuild)...'
    $null = & cargo clean --manifest-path src-tauri/Cargo.toml 2>&1
    if ($LASTEXITCODE -ne 0) { Fail 'cargo clean failed' }
}

# 5. Frontend build (Tauri's beforeBuildCommand will run it again, but doing
#    it here first gives a clearer error if the frontend itself is broken.)
if (-not $SkipFrontend) {
    Info 'Building frontend (npm run build)...'
    $feOut = & npm run build 2>&1
    $feExit = $LASTEXITCODE
    $feOut | Select-String 'built in|error|^\s*✓' |
        ForEach-Object { Write-Host "  $($_.Line.Trim())" }
    if ($feExit -ne 0) { Fail "Frontend build failed (exit $feExit)" }
    Ok 'Frontend built.'
}

# 6. cargo tauri build
# cargo emits progress on stderr, which PowerShell would normally treat as
# NativeCommandError. We capture combined output and decide success by
# content + on-disk artifacts instead of exit code alone.
$cargoArgs = @('tauri', 'build')
foreach ($b in $Bundles) { $cargoArgs += @('-b', $b) }

Info "cargo $($cargoArgs -join ' ')"
$lines = & cargo @cargoArgs 2>&1
$cargoExit = $LASTEXITCODE
$tail = ($lines | Select-Object -Last 60) -join "`n"

if ($tail -match '(?m)^\s*error(\[|:)') {
    Fail "Build failed (exit $cargoExit). Last 60 lines:`n$tail"
}

if ($tail -notmatch 'Finished \d+ bundles? at:') {
    Warn "Couldn't confirm success from output (exit $cargoExit). Last 60 lines:`n$tail"
} else {
    Ok 'Tauri reported a successful bundle.'
}

# 7. List artifacts
$bundleDir = Join-Path $root 'src-tauri\target\release\bundle'
$artifacts = Get-ChildItem -Path $bundleDir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in '.exe', '.msi' }

if (-not $artifacts) {
    Fail "No .exe or .msi artifacts under $bundleDir"
}

Ok 'Artifacts:'
$artifacts | Sort-Object LastWriteTime -Descending | ForEach-Object {
    [pscustomobject]@{
        Path     = $_.FullName.Substring($root.Length + 1)
        Size     = '{0:N2} MB' -f ($_.Length / 1MB)
        Modified = $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
    }
} | Format-Table -AutoSize

Ok 'Done. (Add -Clean for a full Rust rebuild, -SkipTests to skip tests.)'
