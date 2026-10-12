@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%dist\main.js" (
  node "%SCRIPT_DIR%dist\main.js" %*
) else (
  echo Error: SudaFi Agent is not built yet. Run 'pnpm build' first.
  exit /b 1
)
endlocal
