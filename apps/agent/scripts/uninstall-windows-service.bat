@echo off
:: SudaFi Agent Windows Service Uninstaller

echo ========================================================
echo  SudaFi LAN Agent Windows Service Uninstaller
echo ========================================================

echo Stopping and removing Scheduled Task "SudaFiAgent"...
schtasks /end /tn "SudaFiAgent" >nul 2>&1
schtasks /delete /tn "SudaFiAgent" /f

if %ERRORLEVEL% EQU 0 (
  echo SudaFi Agent service uninstalled successfully!
) else (
  echo Task not found or failed to delete. Please run as Administrator.
)
