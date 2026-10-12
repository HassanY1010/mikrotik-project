<#
.SYNOPSIS
    SudaFi Windows LAN Agent - Service Status Inspector
.DESCRIPTION
    Checks service state, PID lock, and tail of log file.
#>

[CmdletBinding()]
param(
    [string]$TaskName = "SudaFi_LAN_Agent",
    [int]$TailLines = 20
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentDir = (Resolve-Path "$ScriptDir\..").Path
$LockFile = Join-Path $AgentDir ".agent.lock"
$LogFile = Join-Path $AgentDir "logs\sudafi-agent.log"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       SudaFi LAN Agent - Service Status Status          " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Scheduled Task
$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Task) {
    Write-Host "Scheduled Task:  Registered ($($Task.State))" -ForegroundColor $(if ($Task.State -eq 'Running') { 'Green' } else { 'Yellow' })
} else {
    Write-Host "Scheduled Task:  Not Registered (Manual background mode)" -ForegroundColor Gray
}

# 2. Check Lock File and Active Process
if (Test-Path $LockFile) {
    try {
        $Lock = Get-Content $LockFile | ConvertFrom-Json
        $Proc = Get-Process -Id $Lock.pid -ErrorAction SilentlyContinue
        if ($Proc) {
            Write-Host "Process State:   ACTIVE (Running)" -ForegroundColor Green
            Write-Host "Process PID:     $($Lock.pid)"
            Write-Host "Started At:      $($Lock.startedAt)"
            Write-Host "Agent Name:      $($Lock.agentName)"
        } else {
            Write-Host "Process State:   STALE LOCK (Process with PID $($Lock.pid) is not running)" -ForegroundColor Red
        }
    } catch {
        Write-Host "Lock File:       Corrupt or inaccessible" -ForegroundColor Red
    }
} else {
    Write-Host "Process State:   STOPPED (No active agent lock)" -ForegroundColor Yellow
}

# 3. Recent Logs
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "Recent Log Entries ($LogFile):" -ForegroundColor Cyan
if (Test-Path $LogFile) {
    Get-Content $LogFile -Tail $TailLines
} else {
    Write-Host "[No log file generated yet]" -ForegroundColor Gray
}
Write-Host "==========================================================" -ForegroundColor Cyan
