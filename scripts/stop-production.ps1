<#
.SYNOPSIS
    Gracefully stops the MikroTik SaaS Platform production processes.
#>

[CmdletBinding()]
param ()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   MikroTik SaaS Platform — Stopping Production Services  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$pm2Available = Get-Command "pm2" -ErrorAction SilentlyContinue
if ($pm2Available) {
    Write-Host "Stopping and deleting PM2 instances..." -ForegroundColor Yellow
    pm2 stop ecosystem.config.js 2>$null
    pm2 delete ecosystem.config.js 2>$null
    Write-Host "PM2 services stopped." -ForegroundColor Green
} else {
    Write-Host "Terminating node processes running from workspace..." -ForegroundColor Yellow
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -match "node"
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "Node processes stopped." -ForegroundColor Green
}

Write-Host "Platform shutdown complete." -ForegroundColor Green
