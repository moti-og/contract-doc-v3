@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%servers.ps1" -Action start
echo.
echo To sideload the Word add-in, run:
echo powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%servers.ps1" -Action sideload
echo.
echo (Press any key to close this window)
pause >nul


