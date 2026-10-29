param(
    [string]$BindHost = '0.0.0.0',

    [int]$Port = 8080,

    # Optional: Director to connect to on start. Otherwise enter it in the page.
    [string]$Director = '',

    # Also start the mock Director and connect to it (no disguise needed).
    [switch]$Mock
)

$ErrorActionPreference = 'Stop'

function Set-Or-ClearEnv {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [string]$Value = ''
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        Remove-Item -Path "Env:$Name" -ErrorAction SilentlyContinue
        return
    }

    Set-Item -Path "Env:$Name" -Value $Value
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptRoot

if (-not (Test-Path (Join-Path $scriptRoot 'node_modules'))) {
    Write-Host "Installing dependencies (first run only)..." -ForegroundColor Yellow
    npm.cmd install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed. Make sure Node.js 22.18+ is installed." }
}

Set-Or-ClearEnv -Name 'HOST' -Value $BindHost
Set-Or-ClearEnv -Name 'PORT' -Value ([string]$Port)
Set-Or-ClearEnv -Name 'DIRECTOR' -Value $Director

Write-Host "Colour Grader launcher configuration:" -ForegroundColor Cyan
Write-Host "  HOST              = $BindHost"
Write-Host "  PORT              = $Port"
Write-Host "  DIRECTOR          = $(if ($Director) { $Director } elseif ($Mock) { 'mock (localhost:8090)' } else { '(enter in the page)' })"
Write-Host ""
Write-Host "  Open http://localhost:5174 once Vite is ready, enter the Director IP and click Connect." -ForegroundColor Green
Write-Host ""

if ($Mock) { npm.cmd run dev -- --mock } else { npm.cmd run dev }
