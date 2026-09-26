# Install-DesktopIcon.ps1
# Puts an "Ethereum Contracting Hub" icon on the desktop that runs Start-Hub.ps1.
# Run it through "Create Desktop Icon.cmd" in the project folder. Delete the icon to remove it.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Launcher = Join-Path $PSScriptRoot 'Start-Hub.ps1'
$Icon = Join-Path $PSScriptRoot 'hub.ico'
$Desktop = [Environment]::GetFolderPath('Desktop')   # follows OneDrive-redirected desktops
$LinkPath = Join-Path $Desktop 'Ethereum Contracting Hub.lnk'
$PowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

foreach ($required in @($Launcher, $Icon, (Join-Path $Root 'package.json'))) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Missing $required - run this from the project folder." }
}

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($LinkPath)
$link.TargetPath = $PowerShell
$link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Launcher`""
$link.WorkingDirectory = $Root
$link.IconLocation = "$Icon,0"
$link.WindowStyle = 1   # normal window, so first-run install progress and "close to stop" are visible
$link.Description = 'Start the Ethereum Contracting Hub (read-only Ethereum data and mining economics)'
$link.Save()

Write-Host "Desktop icon created: $LinkPath"
Write-Host 'Double-click it to start the hub.'
