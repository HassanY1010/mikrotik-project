<#
.SYNOPSIS
    SudaFi Windows LAN Agent - Service/Task Uninstaller
.DESCRIPTION
    Stops any running SudaFi agent instance and unregisters the Scheduled Task cleanly.
#>

[CmdletBinding()]
param(
    [string]$TaskName = "SudaFi_LAN_Agent"
)

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $IsAdmin) {
    Write-Error "[SudaFi Uninstaller] Administrator privileges are required."
    exit 1
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentDir = (Resolve-Path "$ScriptDir\..").Path
$LockFile = Join-Path $AgentDir ".agent.lock"

Write-Host "Stopping and removing SudaFi LAN Agent service..." -ForegroundColor Yellow

# 1. Stop Task
$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Task) {
    if ($Task.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[OK] Task '$TaskName' removed successfully." -ForegroundColor Green
} else {
    Write-Host "[INFO] Task '$TaskName' was not registered." -ForegroundColor Gray
}

# 2. Clean lock file if present
if (Test-Path $LockFile) {
    try {
        $LockContent = Get-Content $LockFile | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($LockContent -and $LockContent.pid) {
            Stop-Process -Id $LockContent.pid -Force -ErrorAction SilentlyContinue
        }
        Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Lock file cleaned." -ForegroundColor Green
    } catch {
        # Ignore
    }
}

Write-Host "[SUCCESS] SudaFi LAN Agent uninstalled completely." -ForegroundColor Green
