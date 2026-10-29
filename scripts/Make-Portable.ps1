#Requires -Version 5.1
<#
.SYNOPSIS
    Build the Colour Grader and package it as a portable Windows ZIP (like Strata's Make-Beta).

.DESCRIPTION
    Nothing needs to be installed on the target machine: the ZIP carries its own node.exe.

        ColourGrader\
          Start-Grader.cmd      double-click launcher
          Start-Grader.ps1      PowerShell launcher (-Port, -BindHost, -Director)
          README.txt            quick start
          node\node.exe         Node runtime (copied from this machine; must be 22.18+)
          app\                  package.json, server\, shared\, dist\, node_modules\ws
          app\data\             created on first run: presets and last Director address

    Output: ColourGrader-v<version>-win-x64.zip in the project root.

.EXAMPLE
    .\scripts\Make-Portable.ps1
    .\scripts\Make-Portable.ps1 -SkipTests
#>
param(
    # Skip `npm test` before packaging.
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'

# ── Paths and version ─────────────────────────────────────────────────────────
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot

$version     = (Get-Content "$projectRoot\package.json" -Raw | ConvertFrom-Json).version
$archiveName = "ColourGrader-v$version-win-x64.zip"
$archivePath = Join-Path $projectRoot $archiveName

Write-Host ""
Write-Host "Colour Grader portable package builder" -ForegroundColor Cyan
Write-Host "  Version : $version"
Write-Host "  Output  : $archiveName"
Write-Host ""

# ── Node runtime to bundle ────────────────────────────────────────────────────
# The server runs TypeScript directly with Node's built-in type stripping (22.18+).
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$nodeVersion = (& $nodeExe -v).TrimStart('v')
if ([version]$nodeVersion -lt [version]'22.18.0') { throw "Node $nodeVersion is too old to bundle; need 22.18 or later." }
Write-Host "  Node    : $nodeVersion ($nodeExe)"
Write-Host ""

# ── 1. Test and build ─────────────────────────────────────────────────────────
if (-not $SkipTests) {
    Write-Host "Step 1a: Running tests..." -ForegroundColor Yellow
    npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw "Tests failed. Fix them or pass -SkipTests." }
}
Write-Host "Step 1b: Building the panel..." -ForegroundColor Yellow
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Build failed." }
Write-Host "  Build complete." -ForegroundColor Green

# ── 2. Assemble staging directory ─────────────────────────────────────────────
Write-Host "Step 2: Copying files..." -ForegroundColor Yellow
$staging = Join-Path $env:TEMP "ColourGrader-portable-staging"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
$inner = Join-Path $staging 'ColourGrader'
$app   = Join-Path $inner 'app'
New-Item -ItemType Directory -Path $app, (Join-Path $inner 'node') | Out-Null

# Node runtime (MIT licence travels with it)
Copy-Item $nodeExe (Join-Path $inner 'node\node.exe')
$nodeLicense = Join-Path (Split-Path -Parent $nodeExe) 'LICENSE'
if (Test-Path $nodeLicense) { Copy-Item $nodeLicense (Join-Path $inner 'node\LICENSE') }

# App: built panel, server and shared code (TypeScript, run as-is), and the one runtime dependency
Copy-Item "$projectRoot\dist"   "$app\dist"   -Recurse
Copy-Item "$projectRoot\server" "$app\server" -Recurse
Copy-Item "$projectRoot\shared" "$app\shared" -Recurse
New-Item -ItemType Directory -Path "$app\node_modules" | Out-Null
Copy-Item "$projectRoot\node_modules\ws" "$app\node_modules\ws" -Recurse

# Trimmed package.json: the server reads its version from it, and "type": "module" makes Node
# treat the .ts files as ES modules.
[ordered]@{ name = 'disguise-colour-grader'; version = $version; private = $true; type = 'module' } |
    ConvertTo-Json | Set-Content "$app\package.json" -Encoding ASCII

# ── Launchers (written inline so the ZIP is standalone) ───────────────────────
@'
@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Grader.ps1" %*
set "exitCode=%ERRORLEVEL%"
if not "%exitCode%"=="0" pause
endlocal & exit /b %exitCode%
'@ | Set-Content "$inner\Start-Grader.cmd" -Encoding ASCII

@'
#Requires -Version 5.1
param(
    [string]$BindHost = '0.0.0.0',

    [int]$Port = 8080,

    # Optional: Director to connect to on start. Otherwise enter it in the page.
    [string]$Director = ''
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$env:HOST = $BindHost
$env:PORT = [string]$Port
if ($Director) { $env:DIRECTOR = $Director } else { Remove-Item Env:DIRECTOR -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "Colour Grader" -ForegroundColor Cyan
Write-Host "-------------"
Write-Host "  HOST     = $BindHost"
Write-Host "  PORT     = $Port"
Write-Host "  DIRECTOR = $(if ($Director) { $Director } else { '(last used, or enter it in the page)' })"
Write-Host ""
Write-Host "  On this laptop:  http://localhost:$Port" -ForegroundColor Green
$lan = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress
foreach ($ip in $lan) { Write-Host "  From a tablet:   http://${ip}:$Port" -ForegroundColor Green }
Write-Host ""
Write-Host "  Press Ctrl+C or close this window to stop."
Write-Host ""

& "$PSScriptRoot\node\node.exe" "$PSScriptRoot\app\server\main.ts"
exit $LASTEXITCODE
'@ | Set-Content "$inner\Start-Grader.ps1" -Encoding UTF8

# ── Quick-start README ────────────────────────────────────────────────────────
@"
Colour Grader $version - portable (Windows x64)
==============================================

Colour grading for a disguise ColourAdjust layer from any browser or tablet.
Nothing to install: this folder carries its own Node runtime.


QUICK START
-----------
  1. Unzip this folder somewhere you can write to (Desktop or Documents,
     not Program Files). Keep the folder together.
  2. Double-click  Start-Grader.cmd
  3. If Windows asks whether node.exe may use the network, allow it on
     private networks - tablets need that to reach the grader.
  4. Open  http://localhost:8080  (the window also lists the address to
     use from a tablet).
  5. Enter the disguise Director's IP and click Connect. It is remembered.
  6. Pick the ColourAdjust layer, then hold SAFE for 1 second to go Live.


OPTIONS (PowerShell)
--------------------
  .\Start-Grader.ps1 -Port 9000                  use another port
  .\Start-Grader.ps1 -Director 192.168.10.11     connect to this Director on start
  .\Start-Grader.ps1 -BindHost 127.0.0.1         this laptop only, no tablets


STOPPING
--------
  Press Ctrl+C in the window, or close it.


YOUR DATA
---------
  app\data\presets.json        saved presets (shared by every panel)
  app\data\server-state.json   last Director address

  To upgrade, unzip the new version and copy app\data\ across from the old
  folder. To move presets to another machine, copy presets.json.


RUNNING BESIDE STRATA
---------------------
  Colour Grader uses port 8080; Strata uses 8081. Both can run at once.


TROUBLESHOOTING
---------------
  "Port 8080 is already in use"
    Another copy is running, or something else has the port. Close it, or
    start with  .\Start-Grader.ps1 -Port 8090

  Windows SmartScreen / "Windows protected your PC"
    The ZIP came from another computer. Right-click the ZIP before
    unzipping > Properties > tick Unblock > OK, then unzip again.

  Tablet can't open the page
    Use the "From a tablet" address shown in the window, make sure the
    tablet is on the same network, and allow node.exe through the Windows
    firewall (Windows Security > Firewall > Allow an app).

  Can't reach the Director
    Check the IP is the Director (not an understudy or render node) and that
    both machines are on the same network.
"@ | Set-Content "$inner\README.txt" -Encoding UTF8

Write-Host "  Files staged." -ForegroundColor Green

# ── 3. Create ZIP ─────────────────────────────────────────────────────────────
Write-Host "Step 3: Creating $archiveName..." -ForegroundColor Yellow
if (Test-Path $archivePath) { Remove-Item $archivePath -Force }
Compress-Archive -Path $inner -DestinationPath $archivePath -CompressionLevel Optimal
Remove-Item $staging -Recurse -Force

$sizeMb = [math]::Round((Get-Item $archivePath).Length / 1MB, 1)
Write-Host "  Done. $archiveName ($sizeMb MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Ready to share: $archivePath" -ForegroundColor Cyan
Write-Host ""
