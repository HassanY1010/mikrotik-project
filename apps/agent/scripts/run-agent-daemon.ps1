<#
.SYNOPSIS
    SudaFi Windows LAN Agent - Wrapper Runner Script
.DESCRIPTION
    Runs the agent daemon silently in the background, redirecting output and errors to logs.
#>

param(
    [string]$AgentDir = "$PSScriptRoot\.."
)

$ResolvedDir = (Resolve-Path $AgentDir).Path
Set-Location $ResolvedDir

$LogDir = Join-Path $ResolvedDir "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$LogFile = Join-Path $LogDir "sudafi-agent.log"
$DistMain = Join-Path $ResolvedDir "dist\main.js"

if (-not (Test-Path $DistMain)) {
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$Timestamp] ERROR: dist/main.js not found. Please build the agent with 'pnpm build' first."
    exit 1
}

$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $LogFile -Value "[$Timestamp] SudaFi LAN Agent daemon starting..."

try {
    # Launch node dist/main.js run with stdout/stderr redirection
    Start-Process -FilePath "node.exe" `
        -ArgumentList "dist/main.js", "run" `
        -WorkingDirectory $ResolvedDir `
        -NoNewWindow `
        -Wait `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError $LogFile
} catch {
    $ErrTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$ErrTimestamp] EXCEPTION: $_"
    exit 1
}
