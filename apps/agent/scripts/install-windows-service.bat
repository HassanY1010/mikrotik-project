@echo off
:: SudaFi Agent Windows Service / Startup Installer
:: Uses Windows Task Scheduler to run the agent on boot with Highest Privileges

echo ========================================================
echo  SudaFi LAN Agent Windows Service Installer
echo ========================================================

set "SCRIPT_DIR=%~dp0..\"
set "AGENT_CMD=%SCRIPT_DIR%sudafi-agent.cmd"

if not exist "%AGENT_CMD%" (
  echo Error: %AGENT_CMD% not found!
  exit /b 1
)

echo Registering Scheduled Task "SudaFiAgent" to start automatically on logon...
schtasks /create /tn "SudaFiAgent" /tr "\"%AGENT_CMD%\" run" /sc ONLOGON /rl HIGHEST /f

if %ERRORLEVEL% EQU 0 (
  echo SudaFi Agent registered successfully in Task Scheduler!
  echo Starting agent task now...
  schtasks /run /tn "SudaFiAgent"
) else (
  echo Failed to register task. Please run as Administrator or check permissions.
)
