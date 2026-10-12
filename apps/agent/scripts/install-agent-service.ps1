<#
.SYNOPSIS
    SudaFi Windows LAN Agent - Automated Task Scheduler Installer
.DESCRIPTION
    Installs SudaFi Windows LAN Agent as a resilient Elevated Scheduled Task (مهمة مجدولة بنظام Windows)
    that starts automatically on Windows logon, restarts on failure, and logs all outputs.
#>

[CmdletBinding()]
param(
    [string]$TaskName = "SudaFi_LAN_Agent",
    [switch]$AtStartup = $false,
    [switch]$UseSystemAccount = $false
)

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $IsAdmin) {
    Write-Error "[SudaFi Installer] Administrator privileges are required to register the Windows scheduled task."
    Write-Host "Please re-run this script in an elevated PowerShell session (Run as Administrator)." -ForegroundColor Yellow
    exit 1
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentDir = (Resolve-Path "$ScriptDir\..").Path
$RunnerScript = Join-Path $ScriptDir "run-agent-daemon.ps1"
$DistMain = Join-Path $AgentDir "dist\main.js"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " SudaFi LAN Agent - Windows Task Scheduler Installer      " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Node.js runtime
try {
    $NodeVersion = & node -v
    Write-Host "[OK] Node.js runtime detected: $NodeVersion" -ForegroundColor Green
} catch {
    Write-Error "[FAIL] Node.js is not found in PATH. Please install Node.js 18+ first."
    exit 1
}

# 2. Check Build
if (-not (Test-Path $DistMain)) {
    Write-Host "[...] dist/main.js not found. Compiling TypeScript..." -ForegroundColor Yellow
    Push-Location $AgentDir
    try {
        & pnpm run build
        Write-Host "[OK] Agent compiled successfully." -ForegroundColor Green
    } catch {
        Write-Error "[FAIL] Failed to compile agent. Please run 'pnpm build' manually."
        Pop-Location
        exit 1
    }
    Pop-Location
} else {
    Write-Host "[OK] Compiled agent dist/main.js found." -ForegroundColor Green
}

# 3. Create Logs Directory
$LogDir = Join-Path $AgentDir "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    Write-Host "[OK] Created logs directory: $LogDir" -ForegroundColor Green
}

# 4. Remove previous task if already exists
$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($ExistingTask) {
    Write-Host "[...] Found existing task '$TaskName'. Replacing..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# 5. Define Task Action
$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunnerScript`"" `
    -WorkingDirectory $AgentDir

# 6. Define Principal & Trigger
# NOTE: Windows DPAPI is scoped to DataProtectionScope::CurrentUser.
# Therefore, the background task MUST run under the credentials of the user who performed
# pairing, so that %APPDATA%\SudaFiAgent\credentials.enc can be decrypted seamlessly.
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if ($UseSystemAccount) {
    $Principal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" `
        -LogonType ServiceAccount `
        -RunLevel Highest

    $Trigger = New-ScheduledTaskTrigger -AtStartup
    Write-Host "[Config] Account: SYSTEM (Boot Startup mode)" -ForegroundColor Gray
} else {
    $Principal = New-ScheduledTaskPrincipal `
        -UserId $CurrentUser `
        -LogonType Interactive `
        -RunLevel Highest

    $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
    Write-Host "[Config] Account: $CurrentUser (DPAPI-Compatible Logon mode)" -ForegroundColor Gray
}

# 7. Define Resilient Settings (Restart on Failure, No Time Limit, Prevent Multi-Instance)
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

# 9. Register Task
try {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $Action `
        -Trigger $Trigger `
        -Principal $Principal `
        -Settings $Settings `
        -Description "SudaFi MikroTik Cloud SaaS LAN Agent Background Service" `
        -Force | Out-Null

    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] SudaFi LAN Agent service installed successfully!" -ForegroundColor Green
    $ModeStr = if ($Trigger.Repetition) { 'Recurring' } else { 'At Logon / Startup' }
    Write-Host " Task Name:     $TaskName"
    Write-Host " Startup Mode:  $ModeStr"
    Write-Host " Working Dir:   $AgentDir"
    Write-Host " Log File:      $LogDir\sudafi-agent.log"
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "To start the service now, run: .\scripts\start-agent-service.ps1" -ForegroundColor Cyan
} catch {
    Write-Error "[FAIL] Could not register scheduled task: $_"
    exit 1
}
