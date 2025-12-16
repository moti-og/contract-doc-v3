@echo off
echo ========================================
echo  WordFTW - Local Development Launcher
echo ========================================
echo.

REM Close Word first to ensure clean sideload
echo [1/8] Closing Word (if running)...
tasklist /FI "IMAGENAME eq WINWORD.EXE" 2>NUL | find /I /N "WINWORD.EXE">NUL
if %ERRORLEVEL% EQU 0 (
  echo   - Word is running. Closing for clean sideload...
  taskkill /F /IM WINWORD.EXE >nul 2>&1
  timeout /t 2 /nobreak >nul
  echo   - Word closed
) else (
  echo   - Word is not running
)
echo.

REM Clean up any existing add-ins (deployed + old local installs)
echo [2/8] Cleaning up existing add-ins...

REM Check for deployed add-in (prod GUID)
reg query "HKCU\Software\Microsoft\Office\16.0\WEF\Developer" /v "wordftw-addin-prod" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo   - Deployed add-in found. Removing...
  reg delete "HKCU\Software\Microsoft\Office\16.0\WEF\Developer" /v "wordftw-addin-prod" /f >nul 2>&1
  echo   - Deployed add-in registry removed
) else (
  echo   - No deployed add-in found
)

REM Check for old local add-in (dev GUID: 7a514d73-03c9-4a9f-a5f3-c246ac785751)
reg query "HKCU\Software\Microsoft\Office\16.0\WEF\Developer" /v "7a514d73-03c9-4a9f-a5f3-c246ac785751" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo   - Old local add-in found. Removing...
  reg delete "HKCU\Software\Microsoft\Office\16.0\WEF\Developer" /v "7a514d73-03c9-4a9f-a5f3-c246ac785751" /f >nul 2>&1
  echo   - Old local add-in registry removed
) else (
  echo   - No old local add-in found
)

REM Clear add-in cache (always do this for clean slate)
echo   - Clearing Word add-in cache...
REM Close Edge/browser processes that might lock cache files
taskkill /F /IM msedge.exe >nul 2>&1
taskkill /F /IM msedgewebview2.exe >nul 2>&1
timeout /t 1 /nobreak >nul
powershell -Command "Remove-Item -Path '$env:LOCALAPPDATA\Microsoft\Office\16.0\Wef\*' -Recurse -Force -ErrorAction SilentlyContinue" >nul 2>&1
echo   - Cache cleared

REM Remove temp manifest files
set TEMP_DIR=%TEMP%\wordftw-addin
if exist "%TEMP_DIR%\manifest.xml" (
  del "%TEMP_DIR%\manifest.xml" >nul 2>&1
  echo   - Temp manifest removed
)
if exist "%TEMP_DIR%" (
  rmdir "%TEMP_DIR%" >nul 2>&1
)

echo   - Cleanup complete
echo.

REM Stop any existing sideloads
echo [3/8] Stopping any existing local sideloads...
set ROOT_DIR=%~dp0..\..
cd /d "%ROOT_DIR%"
REM Skipping office-addin-debugging stop as it can hang
REM Word was already closed in step 1, which stops sideloads
echo   - Skipped (Word already closed in step 1)
echo.

REM Set up environment
echo [4/8] Setting up environment...
echo   - Environment configured (AI uses demo mode with jokes)
echo.

REM Kill all Node processes and start main server fresh
echo [5/8] Main server...
set SCRIPT_DIR=%~dp0

REM Kill ONLY processes on our ports (4000, 4001) - don't kill other Node projects!
echo   - Killing processes on ports 4000 and 4001 only...

REM Kill port 4001 (main server)
powershell -NoProfile -Command "$proc = Get-NetTCPConnection -LocalPort 4001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess; if ($proc) { Write-Host '     Killed process on port 4001 (PID:' $proc ')'; Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 } else { Write-Host '     No process found on port 4001' }"

REM Kill port 4000 (dev server)
powershell -NoProfile -Command "$proc = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess; if ($proc) { Write-Host '     Killed process on port 4000 (PID:' $proc ')'; Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 } else { Write-Host '     No process found on port 4000' }"

timeout /t 1 /nobreak >nul

REM Start server and keep window open on error
echo   - Starting server on port 4001...
start "WordFTW Server" powershell -NoProfile -ExecutionPolicy Bypass -Command "cd '%SCRIPT_DIR%..\..\server'; Write-Host 'Starting server on https://localhost:4001...'; Write-Host ''; npm start; if ($LASTEXITCODE -ne 0) { Write-Host ''; Write-Host 'SERVER FAILED TO START' -ForegroundColor Red; Write-Host 'Check error messages above'; Write-Host ''; Write-Host 'Press any key to close...'; $null = $host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } else { Write-Host 'Server exited unexpectedly'; Read-Host 'Press Enter to close' }"

REM Wait and verify server started
echo   - Waiting for server to start...
timeout /t 5 /nobreak >nul

echo   - Verifying server is running...
powershell -NoProfile -Command "for ($i = 0; $i -lt 30; $i++) { $conn = Get-NetTCPConnection -LocalPort 4001 -State Listen -ErrorAction SilentlyContinue; if ($conn) { Write-Host '     Server is listening on port 4001' -ForegroundColor Green; exit 0 } else { Write-Host '     Waiting for server... ($($i+1)/30)'; Start-Sleep -Seconds 1 } } Write-Host '     ERROR: Server did not start on port 4001' -ForegroundColor Red; exit 1"
if errorlevel 1 goto server_failed
echo   - Server check passed!
goto server_ok

:server_failed
echo.
echo ========================================
echo  Server Failed to Start
echo ========================================
echo.
echo The main server on port 4001 is not responding.
echo Check the "WordFTW Server" window for error messages.
echo.
echo Common issues:
echo   1. Port 4001 already in use by another process
echo   2. Missing node_modules (run: cd server ^&^& npm install)
echo   3. Environment issues (check server/.env)
echo.
echo Press any key to exit...
pause >nul
exit /b 1

:server_ok
echo.

REM Start add-in dev server (port 4000 already killed above)
echo [6/8] Add-in dev server...

REM Start add-in dev server and keep window open on error
echo   - Starting server on port 4000...
start "WordFTW Add-in Dev Server" powershell -NoProfile -ExecutionPolicy Bypass -Command "cd '%SCRIPT_DIR%..\..\addin'; Write-Host 'Starting add-in dev server on https://localhost:4000...'; Write-Host ''; npm run dev-server; if ($LASTEXITCODE -ne 0) { Write-Host ''; Write-Host 'DEV SERVER FAILED TO START' -ForegroundColor Red; Write-Host 'Check error messages above'; Write-Host ''; Write-Host 'Press any key to close...'; $null = $host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } else { Write-Host 'Dev server exited unexpectedly'; Read-Host 'Press Enter to close' }"

REM Wait and verify dev server started
echo   - Waiting for dev server to start...
timeout /t 5 /nobreak >nul

echo   - Verifying dev server is running...
powershell -NoProfile -Command "for ($i = 0; $i -lt 30; $i++) { $conn = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue; if ($conn) { Write-Host '     Dev server is listening on port 4000' -ForegroundColor Green; exit 0 } else { Write-Host '     Waiting for dev server... ($($i+1)/30)'; Start-Sleep -Seconds 1 } } Write-Host '     ERROR: Dev server did not start on port 4000' -ForegroundColor Red; exit 1"
if errorlevel 1 goto devserver_failed
echo   - Dev server check passed!
goto devserver_ok

:devserver_failed
echo.
echo ========================================
echo  Dev Server Failed to Start
echo ========================================
echo.
echo The add-in dev server on port 4000 is not responding.
echo Check the "WordFTW Add-in Dev Server" window for error messages.
echo.
echo Common issues:
echo   1. Port 4000 already in use by another process
echo   2. Missing node_modules (run: cd addin ^&^& npm install)
echo   3. Webpack configuration issues
echo.
echo Press any key to exit...
pause >nul
exit /b 1

:devserver_ok
echo.

REM Clear browser session data automatically
echo [7/8] Preparing browser session...
echo   - Opening browser to clear old session data...
start https://localhost:4001/clear-session.html
timeout /t 2 /nobreak >nul
echo   - Session cleared (browser will auto-redirect)
echo.

REM Sideload local add-in
echo [8/8] Sideloading local add-in...
cd /d "%ROOT_DIR%\addin"
echo   - Working directory: %CD%
echo   - Running: npx office-addin-debugging start manifest.xml
npx office-addin-debugging start manifest.xml
set SIDELOAD_EXIT=%ERRORLEVEL%
if %SIDELOAD_EXIT% EQU 0 (
  echo.
  echo ========================================
  echo  ✅ Local Development Ready!
  echo ========================================
  echo.
  echo 🌐 Browser: https://localhost:4001 (auto-opened)
  echo 📦 Add-in: Sideloaded (localhost:4000)
  echo 📝 Manifest: addin/manifest.xml
  echo.
  echo ✅ Both browser and Word use 'default' session
  echo ✅ Changes sync automatically!
  echo.
  echo Word should open automatically with add-in loaded.
  echo.
  echo To stop:
  echo   1. Run: run-deployed.bat (to switch to deployed)
  echo   2. Or manually: npx office-addin-debugging stop addin/manifest.xml
  echo.
) else (
  echo.
  echo ========================================
  echo  ⚠ Sideload Failed (Exit code: %SIDELOAD_EXIT%)
  echo ========================================
  echo.
  echo Possible issues:
  echo   1. office-addin-debugging not installed
  echo      Fix: npm install -g office-addin-debugging
  echo.
  echo   2. Word already has an add-in sideloaded
  echo      Fix: Close Word and try again
  echo.
  echo   3. manifest.xml has errors
  echo      Fix: cd addin ^&^& npm run validate
  echo.
  echo Try manual sideload:
  echo   cd addin
  echo   npx office-addin-debugging start manifest.xml
  echo.
)
echo.
echo (Press any key to close this window)
pause >nul


