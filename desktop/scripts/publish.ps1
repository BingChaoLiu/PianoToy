#requires -Version 5.0
<#
.SYNOPSIS
    Build, sign, and publish the app to a GitHub Release with auto-update support.

.DESCRIPTION
    Runs `cargo tauri build` with the updater signing key, then uploads the
    NSIS installer (.exe), MSI installer (.msi), and a generated latest.json
    manifest to a new GitHub Release via the gh CLI.

    The latest.json follows the Tauri updater format so the in-app updater
    can find and verify the update.

    Prerequisites:
      - gh CLI installed and authenticated (`gh auth login`)
      - Environment variable TAURI_SIGNING_PRIVATE_KEY set (or passed via -Key)
      - Environment variable TAURI_SIGNING_PRIVATE_KEY_PASSWORD set if the key
        has a password (omit for passwordless keys)

.PARAMETER Version
    Version tag for the release (e.g. "0.2.0"). If omitted, reads from tauri.conf.json.

.PARAMETER Key
    Path to the signing private key. If omitted, uses TAURI_SIGNING_PRIVATE_KEY_PATH env var.

.PARAMETER Notes
    Release notes text. If omitted, opens an editor (or uses --generate-notes for auto notes).

.PARAMETER DryRun
    Build and generate artifacts without uploading to GitHub. Useful for testing.

.PARAMETER SkipBuild
    Skip the build step (assume artifacts already exist in target/release/bundle/).

.EXAMPLE
    .\scripts\publish.ps1 -Version 0.2.0 -Notes "Bug fixes and new note-reading mode"
    .\scripts\publish.ps1 -DryRun
#>
param(
    [string]$Version,
    [string]$Key,
    [string]$Notes,
    [switch]$DryRun,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# --- Helpers ---
function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Die($msg)        { Write-Host "  [FAIL] $msg" -ForegroundColor Red; exit 1 }

#
# Run an external command (cargo, gh) without letting stderr diagnostic
# text trip PowerShell's "Stop" preference. Native commands write progress
# and warnings to stderr, which $ErrorActionPreference="Stop" escalates into
# a terminating error even inside a 2>&1 pipe. We relax the preference only
# for the duration of the call, stream the combined output, and return the
# exit code so the caller can decide how to react.
function Invoke-Native([scriptblock]$sb) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $sb 2>&1 | ForEach-Object { Write-Host $_ }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    return $code
}

# --- 0. Pre-flight checks ---
Write-Step "Pre-flight checks"

# Ensure cargo is in PATH
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Die "cargo not found. Install Rust toolchain first."
}

# Ensure gh CLI is available (unless DryRun)
if (-not $DryRun) {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Die "gh CLI not found. Install from https://cli.github.com and run 'gh auth login'."
    }
    $ghAuthed = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Die "gh CLI not authenticated. Run 'gh auth login' first."
    }
    Write-OK "gh CLI authenticated"
}

# Resolve signing key
$keyPath = if ($Key) { $Key } elseif ($env:TAURI_SIGNING_PRIVATE_KEY_PATH) { $env:TAURI_SIGNING_PRIVATE_KEY_PATH } else { "$env:USERPROFILE\.tauri\pianotoy.key" }
if (-not (Test-Path $keyPath)) {
    Die "Signing key not found at: $keyPath. Generate with 'cargo tauri signer generate -w $keyPath'."
}
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $keyPath -Raw
Write-OK "Signing key: $keyPath"

# Determine repo root (desktop/ directory)
$repoRoot = $PSScriptRoot | Split-Path -Parent
Set-Location $repoRoot
# Sync .NET working directory (Set-Location doesn't affect [System.IO.File] etc.)
[System.IO.Directory]::SetCurrentDirectory($repoRoot)

# Read version from tauri.conf.json if not specified
if (-not $Version) {
    # Read tauri.conf.json as UTF-8 explicitly: PowerShell 5.1's default codepage
    # (e.g. GBK on zh-CN hosts) mangles multibyte chars in the JSON and breaks parsing.
    $tauriConf = [System.IO.File]::ReadAllText("src-tauri\tauri.conf.json", [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
    $Version = $tauriConf.version
}
$tag = "v$Version"
Write-OK "Release version: $tag"

# Update tauri.conf.json version to match the release tag
if ($Version) {
    $confPath = Join-Path $repoRoot "src-tauri\tauri.conf.json"
    $conf = [System.IO.File]::ReadAllText($confPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
    $productName = $conf.productName
    if ($conf.version -ne $Version) {
        $conf.version = $Version
        $json = $conf | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($confPath, $json, [System.Text.UTF8Encoding]::new($false))
        Write-OK "Updated tauri.conf.json version to $Version"
    }
    # Keep Cargo.toml [package].version in sync. Tauri v2 bundles use the
    # tauri.conf.json version, but cargo (and the "Compiling app vX.Y.Z" log
    # line) read Cargo.toml. Letting them drift is confusing, so sync both.
    $cargoPath = Join-Path $repoRoot "src-tauri\Cargo.toml"
    $cargoRaw  = [System.IO.File]::ReadAllText($cargoPath, [System.Text.UTF8Encoding]::new($false))
    if ($cargoRaw -match '(?m)^version\s*=\s*"[^"]*"') {
        $cargoNew = $cargoRaw -replace '(?m)^version\s*=\s*"[^"]*"', ('version = "' + $Version + '"')
        if ($cargoNew -ne $cargoRaw) {
            [System.IO.File]::WriteAllText($cargoPath, $cargoNew, [System.Text.UTF8Encoding]::new($false))
            Write-OK "Updated Cargo.toml version to $Version"
        }
    }
}

# --- 1. Build ---
if (-not $SkipBuild) {
    Write-Step "Building Tauri app (NSIS + MSI + updater artifacts)"
    $buildExit = Invoke-Native { cargo tauri build }
    if ($buildExit -ne 0) {
        Die "cargo tauri build failed (exit $buildExit)"
    }
    Write-OK "Build complete"
} else {
    Write-OK "Skipping build (artifacts assumed to exist)"
}

# --- 2. Locate build artifacts ---
Write-Step "Locating build artifacts"

$bundleDir = Join-Path $repoRoot "src-tauri\target\release\bundle"
if (-not (Test-Path $bundleDir)) {
    Die "Bundle directory not found: $bundleDir. Run without -SkipBuild."
}

# Select artifacts for the EXACT version being released.
# IMPORTANT: Get-ChildItem | Select-Object -First 1 grabs the alphabetically-first
# file, which is a STALE build from an older version when the bundle dir
# accumulates files. Always anchor selection to $productName + $Version.
$nsisDir = Join-Path $bundleDir "nsis"
$exeName = "${productName}_${Version}_x64-setup.exe"
$exeFile = Get-ChildItem $nsisDir -Filter $exeName -ErrorAction SilentlyContinue | Select-Object -First 1
$exeSig  = Get-ChildItem $nsisDir -Filter "${exeName}.sig" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exeFile -or -not $exeSig) {
    Die "NSIS installer or signature not found in $nsisDir (expected $exeName + .sig). Check productName/version and rebuild."
}
Write-OK "NSIS: $($exeFile.Name) + $($exeSig.Name)"

# MSI installer (.msi + .sig)
$msiDir = Join-Path $bundleDir "msi"
$msiName = "${productName}_${Version}_x64_en-US.msi"
$msiFile = Get-ChildItem $msiDir -Filter $msiName -ErrorAction SilentlyContinue | Select-Object -First 1
$msiSig  = Get-ChildItem $msiDir -Filter "${msiName}.sig" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $msiFile -or -not $msiSig) {
    Die "MSI installer or signature not found in $msiDir (expected $msiName + .sig). Check productName/version and rebuild."
}
Write-OK "MSI: $($msiFile.Name) + $($msiSig.Name)"

# --- 3. Generate latest.json ---
Write-Step "Generating latest.json"

# Read signature file contents
$nsisSignature = Get-Content $exeSig.FullName -Raw
$msiSignature  = Get-Content $msiSig.FullName -Raw

# Release notes: use provided notes, or auto-generate
$releaseNotes = if ($Notes) { $Notes } else { "Release $tag" }

# GitHub repo for download URLs
$ghRepo = "BingChaoLiu/PianoToy"

# Build latest.json (Tauri updater manifest format)
 # Using NSIS (.exe) as the primary Windows-x86_64 target.
$latestJson = @{
    version = $Version
    notes = $releaseNotes
    pub_date = (Get-Date -Format "o")
    platforms = @{
        "windows-x86_64" = @{
            signature = $nsisSignature.Trim()
            url = "https://github.com/$ghRepo/releases/download/$tag/$($exeFile.Name)"
        }
    }
} | ConvertTo-Json -Depth 5

$latestPath = Join-Path $bundleDir "latest.json"
[System.IO.File]::WriteAllText($latestPath, $latestJson, [System.Text.UTF8Encoding]::new($false))
Write-OK "latest.json written to $latestPath"
Write-Host $latestJson

# --- 4. DryRun exit ---
if ($DryRun) {
    Write-Step "DryRun complete — artifacts ready, NOT uploaded"
    Write-Host "  NSIS: $($exeFile.FullName)"
    Write-Host "  MSI:  $($msiFile.FullName)"
    Write-Host "  JSON: $latestPath"
    Write-Host "  Re-run without -DryRun to publish."
    exit 0
}

# --- 5. Create GitHub Release and upload assets ---
Write-Step "Publishing to GitHub Release"

Write-Host "  Creating release $tag..."
$prevEAP2 = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& gh release create $tag `
    $exeFile.FullName `
    $exeSig.FullName `
    $msiFile.FullName `
    $msiSig.FullName `
    $latestPath `
    --repo $ghRepo `
    --title $tag `
    --notes $releaseNotes `
    --generate-notes
$ghExit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP2
if ($ghExit -ne 0) {
    Die "gh release create failed (exit $ghExit)"
}
Write-OK "Release $tag published!"

Write-Step "Done"
Write-Host "  Release URL: https://github.com/$ghRepo/releases/tag/$tag"
Write-Host "  Users will see the update badge on next app launch."
Write-Host ""
Write-Host "  IMPORTANT: Keep $keyPath safe. Losing it means future updates"
Write-Host "  won't be installable by existing users."
