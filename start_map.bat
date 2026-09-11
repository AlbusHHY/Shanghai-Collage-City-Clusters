@echo off
setlocal
cd /d "%~dp0"
title Shanghai Urban Form Web Map
echo Starting the local map server...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_map_server.ps1"
if errorlevel 1 (
  echo.
  echo The map server could not start. See the message above.
  pause
)
endlocal
