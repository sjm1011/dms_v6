@echo off
chcp 65001
setlocal EnableExtensions EnableDelayedExpansion

set "FRONTEND=dmsV6"
set "DOCS=參考文件"
set "DOCS_SCRIPT=參考文件\watch.js"
set "DEV_HOST=0.0.0.0"
set "DEV_PORT=3000"
set "LOCAL_APP_URL=http://localhost:%DEV_PORT%/"
set "LAN_HOST=localhost"
set "LAN_APP_URL=http://localhost:%DEV_PORT%/"
set "APP_URL=%LOCAL_APP_URL%"
set "NEXT_PID="

echo ===================================================
echo   DMS V6 Next.js Test Launcher
echo ===================================================

call :ReadLanHost

where npm
if errorlevel 1 (
    if exist "C:\Program Files\nodejs\npm.cmd" (
        echo [INFO] Node.js was found in Program Files. Adding it to PATH for this run.
        set "PATH=%PATH%;C:\Program Files\nodejs"
    )
)

where npm
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] npm was not found.
    echo [Suggested Fix] Install Node.js LTS and make sure npm is available in PATH.
    goto fail
)

where node
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] node was not found.
    echo [Suggested Fix] Install Node.js LTS and make sure node is available in PATH.
    goto fail
)

if not exist "%FRONTEND%\package.json" (
    echo [Status] Failed
    echo [Root Cause] Frontend package.json was not found: %FRONTEND%\package.json
    echo [Suggested Fix] Run _run.bat from the V6 project root.
    goto fail
)

if not exist "%DOCS_SCRIPT%" (
    echo [Status] Failed
    echo [Root Cause] Documentation builder was not found: %DOCS_SCRIPT%
    echo [Suggested Fix] Restore the documentation builder or remove the docs step.
    goto fail
)

call :AssertPortAvailable "%DEV_PORT%" "Next.js dev server"
if errorlevel 1 goto fail

echo.
echo [1/3] Checking frontend dependencies...
pushd "%FRONTEND%"
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] Cannot enter frontend folder: %FRONTEND%
    echo [Suggested Fix] Check folder permissions and path.
    goto fail
)

if exist "node_modules\" goto frontend_deps_ready
if exist "package-lock.json" goto frontend_install_ci

echo [INFO] package-lock.json was not found. Running npm install...
call npm install
goto frontend_install_done

:frontend_install_ci
echo [INFO] Installing frontend packages with npm ci...
call npm ci

:frontend_install_done
if errorlevel 1 (
    popd
    echo [Status] Failed
    echo [Root Cause] Frontend dependency installation failed.
    echo [Suggested Fix] Run npm install in a network-enabled environment.
    goto fail
)

:frontend_deps_ready
echo.
echo [2/3] Building Next.js frontend...
if exist ".next\dev\" rmdir /S /Q ".next\dev"
call npm run build
if errorlevel 1 (
    popd
    echo [Status] Failed
    echo [Root Cause] Next.js build failed.
    echo [Suggested Fix] Fix the TypeScript or build error above first.
    goto fail
)
popd
echo [OK] Next.js frontend build passed.

echo.
echo [3/3] Building documentation index...
call node "%DOCS_SCRIPT%"
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] Documentation build failed.
    echo [Suggested Fix] Check %DOCS_SCRIPT%.
    goto fail
)
echo [OK] Documentation index was generated.

echo.
echo [START] Next.js dev server...
call :AssertPortAvailable "%DEV_PORT%" "Next.js dev server"
if errorlevel 1 goto fail

call :StartNext
if not defined NEXT_PID (
    echo [Status] Failed
    echo [Root Cause] Cannot start Next.js dev server.
    echo [Suggested Fix] Run npm run dev manually inside the %FRONTEND% folder and check the error.
    goto fail
)

echo [INFO] Next.js command window started. PID: !NEXT_PID!
call :WaitForPort "%DEV_PORT%" 30
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] Next.js did not start on port %DEV_PORT%.
    echo [Suggested Fix] Check the DMS V6 Next.js Server command window.
    goto fail
)

echo [OK] Next.js dev server is ready: %APP_URL%
echo [INFO] LAN URL for other computers: %LAN_APP_URL%

if /I "%DMS_AUTO_EXIT%"=="1" (
    echo [INFO] DMS_AUTO_EXIT=1. Cleanup will stop services started by this script.
    call :CleanupStarted
    goto end_script
)

:browser_menu
echo.
echo ===================================================
echo   Select preview target
echo   Local URL: %LOCAL_APP_URL%
echo   LAN URL  : %LAN_APP_URL%
echo ===================================================
echo   1. Open DMS with Microsoft Edge
echo   2. Open DMS with Google Chrome
echo   3. Open DMS with Mozilla Firefox
echo   4. Open documentation index.html
echo   5. Open LAN URL with Microsoft Edge
echo   6. Open LAN URL with Google Chrome
echo   7. Open LAN URL with Mozilla Firefox
echo   0. Exit and stop services started by this script
echo ===================================================
set /p browser_choice="Select option (0-7): "

if "%browser_choice%"=="1" (
    call :OpenBrowser "msedge" "%LOCAL_APP_URL%"
    goto browser_menu
)
if "%browser_choice%"=="2" (
    call :OpenBrowser "chrome" "%LOCAL_APP_URL%"
    goto browser_menu
)
if "%browser_choice%"=="3" (
    call :OpenBrowser "firefox" "%LOCAL_APP_URL%"
    goto browser_menu
)
if "%browser_choice%"=="4" (
    start "" "%DOCS%\index.html"
    goto browser_menu
)
if "%browser_choice%"=="5" (
    call :OpenBrowser "msedge" "%LAN_APP_URL%"
    goto browser_menu
)
if "%browser_choice%"=="6" (
    call :OpenBrowser "chrome" "%LAN_APP_URL%"
    goto browser_menu
)
if "%browser_choice%"=="7" (
    call :OpenBrowser "firefox" "%LAN_APP_URL%"
    goto browser_menu
)
if "%browser_choice%"=="0" (
    call :CleanupStarted
    goto end_script
)

echo [WARN] Invalid option.
goto browser_menu

:end_script
cls
echo Done.
endlocal
exit /b 0

:fail
call :CleanupStarted
echo.
echo [ABORTED] _run.bat did not complete.
if /I not "%DMS_AUTO_EXIT%"=="1" pause
endlocal
exit /b 1

:ReadLanHost
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } | Select-Object -First 1 -ExpandProperty IPv4Address).IPAddress"`) do set "LAN_HOST=%%i"
if not defined LAN_HOST set "LAN_HOST=localhost"
set "LAN_APP_URL=http://%LAN_HOST%:%DEV_PORT%/"
exit /b 0

:AssertPortAvailable
set "CHECK_PORT=%~1"
set "CHECK_LABEL=%~2"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = [int]$env:CHECK_PORT; $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; if ($conn) { $conn | Select-Object -First 1 -ExpandProperty OwningProcess; exit 1 } else { exit 0 }"
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] %CHECK_LABEL% port %CHECK_PORT% is already in use.
    echo [Suggested Fix] Stop that process or change the port setting in _run.bat.
    exit /b 1
)
exit /b 0

:WaitForPort
set "WAIT_PORT=%~1"
set "WAIT_SECONDS=%~2"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddSeconds([int]$env:WAIT_SECONDS); do { try { $c = [Net.Sockets.TcpClient]::new(); $c.Connect('127.0.0.1', [int]$env:WAIT_PORT); $c.Close(); exit 0 } catch { Start-Sleep -Seconds 1 } } while ((Get-Date) -lt $deadline); exit 1"
exit /b %errorlevel%

:StartNext
for /f "usebackq delims=" %%p in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$cmd = 'title DMS V6 Next.js Server ' + [char]38 + [char]38 + ' npm run dev -- -H ' + $env:DEV_HOST + ' -p ' + $env:DEV_PORT; $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/s','/k',$cmd -WorkingDirectory $env:FRONTEND -PassThru; $p.Id"`) do set "NEXT_PID=%%p"
exit /b 0

:OpenBrowser
set "BROWSER_EXE=%~1"
set "BROWSER_URL=%~2"
start "" "%BROWSER_EXE%" "%BROWSER_URL%"
exit /b 0

:CleanupStarted
if defined NEXT_PID (
    call :StopProcessTree "!NEXT_PID!" "Next.js dev server"
    set "NEXT_PID="
)
exit /b 0

:StopProcessTree
set "STOP_PID=%~1"
set "STOP_LABEL=%~2"
taskkill /T /F /PID %STOP_PID%
if errorlevel 1 (
    echo [INFO] %STOP_LABEL% is already stopped or not found.
) else (
    echo [OK] %STOP_LABEL% was stopped.
)
exit /b 0
