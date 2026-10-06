<#
.SYNOPSIS
    PostgreSQL Database Restore Script for Windows.
.DESCRIPTION
    Restores the specified database dump created by backup-db.ps1.
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [string]$Database = "mikrotik_saas",
    [string]$Host = "localhost",
    [int]$Port = 5432,
    [string]$User = "postgres"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
    Write-Error "Specified backup file does not exist: $BackupFile"
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   PostgreSQL Database Restore: $Database                 " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Restoring from: $BackupFile" -ForegroundColor Yellow

$pgRestore = Get-Command "pg_restore" -ErrorAction SilentlyContinue
if (-not $pgRestore) {
    $standardPath = "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe"
    if (Test-Path $standardPath) {
        $pgRestorePath = $standardPath
    } else {
        $pgRestoreItem = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_restore.exe" -ErrorAction SilentlyContinue | Select-Object -Last 1
        if ($pgRestoreItem) {
            $pgRestorePath = $pgRestoreItem.FullName
        } else {
            Write-Error "pg_restore.exe not found."
            exit 1
        }
    }
} else {
    $pgRestorePath = $pgRestore.Source
}

Write-Host "Using pg_restore: $pgRestorePath" -ForegroundColor Gray
& $pgRestorePath -h $Host -p $Port -U $User -d $Database --clean --if-exists -v $BackupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Database restored successfully!" -ForegroundColor Green
} else {
    Write-Warning "pg_restore finished with exit code $LASTEXITCODE (non-zero may indicate minor schema warnings)."
}
