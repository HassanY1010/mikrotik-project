<#
.SYNOPSIS
    SudaFi Windows LAN Agent Launcher
.DESCRIPTION
    Launches SudaFi LAN Agent with provided arguments.
#>
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MainJs = Join-Path $ScriptDir "dist\main.js"

if (-not (Test-Path $MainJs)) {
    Write-Error "Error: SudaFi Agent is not built yet. Run 'pnpm build' first."
    exit 1
}

node $MainJs @args
