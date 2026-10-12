<#
.SYNOPSIS
    SudaFi Windows LAN Agent - Service Starter
.DESCRIPTION
    Starts the registered SudaFi Scheduled Task or runs a local background instance.
#>

[CmdletBinding()]
param(
    [string]$TaskName = "SudaFi_LAN_Agent"
)

$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($Task) {
    if ($Task.State -eq 'Running') {
        Write-Host "[INFO] SudaFi LAN Agent is already running." -ForegroundColor Yellow
        exit 0
    }
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 2
    $Refreshed = Get-ScheduledTask -TaskName $TaskName
    Write-Host "[OK] SudaFi LAN Agent started. Current State: $($Refreshed.State)" -ForegroundColor Green
} else {
    Write-Warning "[NOTICE] Scheduled Task '$TaskName' not found."
    Write-Host "Running agent in background directly via run-agent-daemon.ps1..." -ForegroundColor Yellow
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $Runner = Join-Path $ScriptDir "run-agent-daemon.ps1"
    Start-Process powershell.exe -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`""
    Write-Host "[OK] Background agent process launched." -ForegroundColor Green
}
