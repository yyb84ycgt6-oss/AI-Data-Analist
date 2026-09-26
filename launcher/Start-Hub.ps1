# Start-Hub.ps1
# Starts the Ethereum Contracting Hub (this app) on this PC and opens it in the default browser.
# The desktop icon runs this script. Close the "Ethereum Contracting Hub" console window to stop it.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # no progress bar flashing during the port check
$Port = 5317
$StartPath = '/#ethereum'
$Url = "http://127.0.0.1:$Port$StartPath"
$Root = Split-Path -Parent $PSScriptRoot
$Title = 'Ethereum Contracting Hub'

Set-Location -LiteralPath $Root
$Host.UI.RawUI.WindowTitle = $Title
Add-Type -AssemblyName System.Windows.Forms

function Show-Error([string]$Message) {
  [System.Windows.Forms.MessageBox]::Show($Message, $Title, 'OK', 'Error') | Out-Null
}

function Test-PortOpen {
  $client = New-Object System.Net.Sockets.TcpClient
  try { return $client.ConnectAsync('127.0.0.1', $Port).Wait(500) -and $client.Connected }
  catch { return $false }
  finally { $client.Dispose() }
}

function Test-HubResponding {
  try {
    $page = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 3
    return $page.Content -match '<title>AI Data Analyst'
  } catch { return $false }
}

# Already running (icon double-clicked twice): just open another browser tab.
if (Test-PortOpen) {
  if (Test-HubResponding) { Start-Process $Url; exit 0 }
  Show-Error "Port $Port is already used by another program, so the hub cannot start.`n`nClose that program, or change `$Port in:`n$PSCommandPath"
  exit 1
}

# Node.js 18+ is required by Vite.
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Show-Error "Node.js is not installed.`n`nInstall the LTS version from https://nodejs.org (or run: winget install OpenJS.NodeJS.LTS), then double-click the icon again."
  Start-Process 'https://nodejs.org/en/download'
  exit 1
}
$nodeMajor = [int](& node.exe -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) {
  Show-Error "Node.js $nodeMajor is too old. Install Node.js 18 or newer from https://nodejs.org, then try again."
  exit 1
}

# Install dependencies on first run, and again whenever package-lock.json changes (e.g. after git pull).
$lockFile = Join-Path $Root 'package-lock.json'
$installedStamp = Join-Path $Root 'node_modules\.package-lock.json'
$needsInstall = -not (Test-Path -LiteralPath $installedStamp)
if (-not $needsInstall) {
  $needsInstall = (Get-Item -LiteralPath $lockFile).LastWriteTime -gt (Get-Item -LiteralPath $installedStamp).LastWriteTime
}
if ($needsInstall) {
  Write-Host 'Installing dependencies (first run only, about a minute)...'
  & npm.cmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    Show-Error 'Installing dependencies failed. The console window shows the npm error.'
    Read-Host 'Press Enter to close'
    exit 1
  }
}

Write-Host ''
Write-Host "  $Title is running at $Url"
Write-Host '  Close this window to stop it.'
Write-Host ''

# Vite opens the browser once the server is ready.
$vite = Join-Path $Root 'node_modules\vite\bin\vite.js'
& node.exe $vite --host 127.0.0.1 --port $Port --strictPort --open $StartPath
if ($LASTEXITCODE -ne 0) {
  Show-Error "The hub stopped (exit code $LASTEXITCODE). The console window shows the error."
  Read-Host 'Press Enter to close'
}
