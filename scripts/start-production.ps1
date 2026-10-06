<#
.SYNOPSIS
    Starts the MikroTik SaaS Platform in production mode on Windows.
.DESCRIPTION
    Checks local PostgreSQL service, applies Prisma database migrations,
    verifies production builds, and launches backend API and admin web app.
#>

[CmdletBinding()]
param (
    [switch]$SkipMigration,
    [switch]$Foreground
)

$ErrorActionPreference = "Stop"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   MikroTik SaaS Platform — Production Startup Script     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify PostgreSQL Windows Service
Write-Host "`n[1/4] Checking PostgreSQL Windows Service..." -ForegroundColor Yellow
$pgService = Get-Service -Name "postgresql-x64-18" -ErrorAction SilentlyContinue
if (-not $pgService) {
    # Fallback check for any postgresql service
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
}

if ($pgService) {
    if ($pgService.Status -ne "Running") {
        Write-Host "PostgreSQL service ($($pgService.Name)) is stopped. Starting service..." -ForegroundColor Yellow
        Start-Service -Name $pgService.Name
        Start-Sleep -Seconds 2
    }
    Write-Host "PostgreSQL service ($($pgService.Name)) is active and running." -ForegroundColor Green
} else {
    Write-Warning "PostgreSQL Windows service not detected by standard name. Ensure PostgreSQL 18 is running on localhost:5432."
}

# 2. Database Migrations
if (-not $SkipMigration) {
    Write-Host "`n[2/4] Applying Prisma database migrations..." -ForegroundColor Yellow
    pnpm --filter @mikrotik-saas/api db:migrate:deploy
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Database migration failed with exit code $LASTEXITCODE. Aborting startup."
        exit $LASTEXITCODE
    }
    Write-Host "Database migrations verified and up to date." -ForegroundColor Green
} else {
    Write-Host "`n[2/4] Skipping database migrations as requested." -ForegroundColor Gray
}

# 3. Verify Production Builds
Write-Host "`n[3/4] Verifying production artifacts..." -ForegroundColor Yellow
if (-not (Test-Path "apps/api/dist/main.js")) {
    Write-Host "Backend API production build not found. Building API..." -ForegroundColor Yellow
    pnpm --filter @mikrotik-saas/api build
}
if (-not (Test-Path "apps/admin/dist/index.html")) {
    Write-Host "Admin Web App production build not found. Building Admin..." -ForegroundColor Yellow
    pnpm --filter @mikrotik-saas/admin build
}
Write-Host "Production artifacts verified." -ForegroundColor Green

# 4. Start Production Services
Write-Host "`n[4/4] Starting applications..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "logs" | Out-Null

$pm2Available = Get-Command "pm2" -ErrorAction SilentlyContinue
if ($pm2Available) {
    Write-Host "Starting processes via PM2 Process Manager..." -ForegroundColor Cyan
    pm2 start ecosystem.config.js
    pm2 status
} else {
    Write-Host "PM2 not found in PATH. Starting native Node.js processes..." -ForegroundColor Cyan
    if ($Foreground) {
        Write-Host "Starting API in current window..." -ForegroundColor Green
        node apps/api/dist/main.js
    } else {
        Start-Process -FilePath "node" -ArgumentList "apps/api/dist/main.js" -RedirectStandardOutput "logs/api-out.log" -RedirectStandardError "logs/api-err.log"
        Start-Process -FilePath "pnpm" -ArgumentList "--filter @mikrotik-saas/admin preview --port 5173 --host 0.0.0.0" -RedirectStandardOutput "logs/admin-out.log" -RedirectStandardError "logs/admin-err.log"
        Write-Host "Services started in background. Logs are written to logs/api-out.log and logs/admin-out.log." -ForegroundColor Green
    }
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "   Platform is live!                                       " -ForegroundColor Green
Write-Host "   - API Gateway:    http://localhost:3000                 " -ForegroundColor Green
Write-Host "   - Swagger Docs:   http://localhost:3000/docs            " -ForegroundColor Green
Write-Host "   - Admin Portal:   http://localhost:5173                 " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
