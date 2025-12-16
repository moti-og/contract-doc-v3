@echo off
setlocal enabledelayedexpansion

REM Setup logging
set LOG_DIR=%LOCALAPPDATA%\wordftw-addin
set LOG_FILE=%LOG_DIR%\install.log
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM Create log file with timestamp
echo ======================================== > "%LOG_FILE%"
echo  Redlined ^& Signed - Word Add-in Installer >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
echo Installation started: %DATE% %TIME% >> "%LOG_FILE%"
echo Running as user: %USERNAME% >> "%LOG_FILE%"
echo Computer: %COMPUTERNAME% >> "%LOG_FILE%"
echo Windows Version: %OS% >> "%LOG_FILE%"
echo Log file: %LOG_FILE% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo ========================================
echo  Redlined ^& Signed - Word Add-in Installer
echo ========================================
echo.
echo This will install the Word add-in...
echo Log file: %LOG_FILE%
echo.

REM Close Word if it's running (MUST be closed before registry changes)
echo [STEP 1/5] Closing Word if running...
echo [STEP 1/5] Closing Word if running... >> "%LOG_FILE%"
taskkill /F /IM WINWORD.EXE >nul 2>&1
if !ERRORLEVEL! EQU 0 (
  echo   - Word was running and has been closed >> "%LOG_FILE%"
  echo   - Word was running and has been closed
) else (
  echo   - Word was not running >> "%LOG_FILE%"
  echo   - Word was not running
)
timeout /t 2 /nobreak >nul

REM Download manifest to temp location
echo.
echo [STEP 2/5] Downloading manifest...
echo [STEP 2/5] Downloading manifest... >> "%LOG_FILE%"
set TEMP_DIR=%TEMP%\wordftw-addin
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"
echo   - Creating temp directory: %TEMP_DIR% >> "%LOG_FILE%"
echo   - URL: https://wordftw.onrender.com/manifest.xml >> "%LOG_FILE%"
echo   - Destination: %TEMP_DIR%\manifest.xml >> "%LOG_FILE%"

powershell -Command "try { Invoke-WebRequest -Uri 'https://wordftw.onrender.com/manifest.xml' -OutFile '%TEMP_DIR%\manifest.xml' -ErrorAction Stop; exit 0 } catch { Write-Host 'ERROR:' $_.Exception.Message; exit 1 }" >> "%LOG_FILE%" 2>&1

if !ERRORLEVEL! NEQ 0 (
  echo   [ERROR] Failed to download manifest >> "%LOG_FILE%"
  echo   [ERROR] Failed to download manifest
  echo   Check internet connection and server availability >> "%LOG_FILE%"
  goto :error
)

if exist "%TEMP_DIR%\manifest.xml" (
  for %%A in ("%TEMP_DIR%\manifest.xml") do set FILE_SIZE=%%~zA
  echo   - Downloaded successfully ^(!FILE_SIZE! bytes^) >> "%LOG_FILE%"
  echo   - Downloaded successfully
) else (
  echo   [ERROR] Manifest file not found after download >> "%LOG_FILE%"
  echo   [ERROR] Manifest file not found after download
  goto :error
)

REM Register manifest directly via Developer registry key
echo.
echo [STEP 3/5] Registering add-in...
echo [STEP 3/5] Registering add-in... >> "%LOG_FILE%"
set MANIFEST_PATH=%TEMP_DIR%\manifest.xml
set ADDIN_ID=wordftw-addin-prod
echo   - Manifest path: %MANIFEST_PATH% >> "%LOG_FILE%"
echo   - Add-in ID: %ADDIN_ID% >> "%LOG_FILE%"

REM Office 2016/2019/2021/365 (16.0)
echo   - Attempting to register for Office 16.0 ^(2016/2019/2021/365^) >> "%LOG_FILE%"
reg add "HKCU\Software\Microsoft\Office\16.0\WEF\Developer" /v "%ADDIN_ID%" /t REG_SZ /d "%MANIFEST_PATH%" /f >> "%LOG_FILE%" 2>&1
if !ERRORLEVEL! EQU 0 (
  echo   - Successfully registered for Office 16.0 >> "%LOG_FILE%"
  echo   - Registered for Office 2016/2019/2021/365
) else (
  echo   - Failed to register for Office 16.0 >> "%LOG_FILE%"
)

REM Office 2013 (15.0) - fallback
echo   - Attempting to register for Office 15.0 ^(2013^) >> "%LOG_FILE%"
reg add "HKCU\Software\Microsoft\Office\15.0\WEF\Developer" /v "%ADDIN_ID%" /t REG_SZ /d "%MANIFEST_PATH%" /f >> "%LOG_FILE%" 2>&1
if !ERRORLEVEL! EQU 0 (
  echo   - Successfully registered for Office 15.0 >> "%LOG_FILE%"
) else (
  echo   - Failed to register for Office 15.0 ^(fallback^) >> "%LOG_FILE%"
)

echo.
echo ========================================
echo  Installation Complete!
echo ========================================
echo.
echo ========================================  >> "%LOG_FILE%"
echo  Installation Complete!  >> "%LOG_FILE%"
echo ========================================  >> "%LOG_FILE%"
echo.  >> "%LOG_FILE%"

echo [STEP 4/5] Downloading document and opening Word...
echo [STEP 4/5] Downloading document... >> "%LOG_FILE%"

REM Download the default document from the server
set DOC_PATH=%TEMP%\wordftw-document.docx
echo   - URL: https://wordftw.onrender.com/documents/working/default.docx >> "%LOG_FILE%"
echo   - Destination: %DOC_PATH% >> "%LOG_FILE%"

powershell -Command "try { Invoke-WebRequest -Uri 'https://wordftw.onrender.com/documents/working/default.docx' -OutFile '%DOC_PATH%' -ErrorAction Stop; Write-Host '  Document downloaded' } catch { Write-Host '  Download failed:' $_.Exception.Message; exit 1 }" >> "%LOG_FILE%" 2>&1

REM Open Word with the downloaded document
echo.
echo [STEP 5/5] Opening Word...
echo [STEP 5/5] Opening Word... >> "%LOG_FILE%"

if exist "%DOC_PATH%" (
  echo   - Opening Word with document: %DOC_PATH% >> "%LOG_FILE%"
  start winword.exe "%DOC_PATH%"
  timeout /t 2 /nobreak >nul
  echo   - Word started successfully >> "%LOG_FILE%"
  echo.
  echo ========================================
  echo  Next Steps: Activate the Add-in
  echo ========================================
  echo.
  echo Word is now open with your document.
  echo.
  echo TO ACTIVATE THE ADD-IN ^(first time only^):
  echo   1. In Word, click the "Insert" tab
  echo   2. Click "Get Add-ins" or "My Add-ins"
  echo   3. Click "Developer Add-ins" at the top
  echo   4. Click "Redlined ^& Signed"
  echo.
  echo The add-in panel will appear on the right side.
  echo After this first activation, it will remember your choice.
  echo.
) else (
  echo   [ERROR] Could not download document from server >> "%LOG_FILE%"
  echo.
  echo [ERROR] Could not download document from server.
  echo Please check your internet connection.
  echo.
  echo   - Opening Word without document >> "%LOG_FILE%"
  start winword.exe
)

echo.
echo Installation completed: %DATE% %TIME% >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
echo Installation log saved to: >> "%LOG_FILE%"
echo %LOG_FILE% >> "%LOG_FILE%"
echo.
echo Installation log saved to:
echo %LOG_FILE%
echo.
echo Press any key to close this window...
pause >nul
exit /b 0

:error
echo.
echo ========================================
echo  [ERROR] Installation Failed
echo ========================================
echo.
echo ======================================== >> "%LOG_FILE%"
echo  [ERROR] Installation Failed >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"
echo Failed at: %DATE% %TIME% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
echo DEBUG INFORMATION: >> "%LOG_FILE%"
echo - Windows Version: %OS% >> "%LOG_FILE%"
echo - User: %USERNAME% >> "%LOG_FILE%"
echo - Computer: %COMPUTERNAME% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
echo Full installation log saved to: >> "%LOG_FILE%"
echo %LOG_FILE% >> "%LOG_FILE%"
echo.
echo Full installation log saved to:
echo %LOG_FILE%
echo.
echo Please send this log file to support for assistance.
echo.
echo Press any key to close this window...
pause >nul
exit /b 1

