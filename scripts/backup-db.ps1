<#
.SYNOPSIS
    Automated PostgreSQL Database Backup Script for Windows.
.DESCRIPTION
    Creates a timestamped compressed SQL dump of the mikrotik_saas database,
    verifies file integrity, and prunes backups older than the retention threshold.
#>

[CmdletBinding()]
param (
    [string]$Database = "mikrotik_saas",
    [string]$Host = "localhost",
    [int]$Port = 5432,
    [string]$User = "postgres",
    [string]$BackupDir = "backups",
    [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$targetFolder = Join-Path $PSScriptRoot "..\$BackupDir"
New-Item -ItemType Directory -Force -Path $targetFolder | Out-Null

$dumpFile = Join-Path $targetFolder "$($Database)_$timestamp.sql"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   PostgreSQL Database Backup: $Database                  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Locate pg_dump in standard PostgreSQL 18 or PATH
$pgDump = Get-Command "pg_dump" -ErrorAction SilentlyContinue
if (-not $pgDump) {
    $standardPath = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
    if (Test-Path $standardPath) {
        $pgDumpPath = $standardPath
    } else {
        # Check any PostgreSQL version in Program Files
        $pgDumpItem = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue | Select-Object -Last 1
        if ($pgDumpItem) {
            $pgDumpPath = $pgDumpItem.FullName
        } else {
            Write-Error "pg_dump.exe not found in PATH or standard installation directories."
            exit 1
        }
    }
} else {
    $pgDumpPath = $pgDump.Source
}

Write-Host "Using pg_dump: $pgDumpPath" -ForegroundColor Gray
Write-Host "Target backup file: $dumpFile" -ForegroundColor Yellow

& $pgDumpPath -h $Host -p $Port -U $User -F c -b -v -f $dumpFile $Database

if ($LASTEXITCODE -eq 0 -and (Test-Path $dumpFile)) {
    $fileSize = (Get-Item $dumpFile).Length / 1MB
    Write-Host "Backup completed successfully! Size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Green
} else {
    Write-Error "Backup failed with exit code $LASTEXITCODE."
    exit $LASTEXITCODE
}

# Retention pruning
Write-Host "Pruning backups older than $RetentionDays days..." -ForegroundColor Yellow
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $targetFolder -Filter "$($Database)_*.sql" | Where-Object { $_.CreationTime -lt $cutoff } | ForEach-Object {
    Write-Host "Removing expired backup: $($_.Name)" -ForegroundColor Gray
    Remove-Item $_.FullName -Force
}

Write-Host "Backup job completed successfully." -ForegroundColor Green
