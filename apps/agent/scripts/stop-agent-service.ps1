<#
.SYNOPSIS
    SudaFi Windows LAN Agent - Service Stopper
.DESCRIPTION
    Stops the SudaFi Agent task and gracefully terminates any running agent process.
#>

[CmdletBinding()]
param(
    [string]$TaskName = "SudaFi_LAN_Agent"
)

$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Task -and $Task.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Write-Host "[OK] Scheduled task '$TaskName' signaled to stop." -ForegroundColor Green
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentDir = (Resolve-Path "$ScriptDir\..").Path
$LockFile = Join-Path $AgentDir ".agent.lock"

if (Test-Path $LockFile) {
    try {
        $Lock = Get-Content $LockFile | ConvertFrom-Json
        if ($Lock -and $Lock.pid) {
            Write-Host "[...] Terminating agent process with PID $($Lock.pid)..." -ForegroundColor Yellow
            Stop-Process -Id $Lock.pid -Force -ErrorAction SilentlyContinue
        }
        Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Process terminated and lock cleared." -ForegroundColor Green
    } catch {
        # Ignore
    }
}

Write-Host "[OK] SudaFi LAN Agent stopped." -ForegroundColor Green
