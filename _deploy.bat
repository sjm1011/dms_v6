@echo off
chcp 65001 > nul
setlocal EnableExtensions EnableDelayedExpansion

set "FRONTEND=dmsV6"
set "APP_SUBDIR=app"
set "IIS_SUBDIR=iis-root"
set "DEFAULT_PORT=3502"

echo ===================================================
echo   DMS V6 IIS Standalone Deploy
echo ===================================================
echo.
echo 請輸入部署根目錄，例如：C:\DMS
echo 成品會複製到：部署根目錄\%APP_SUBDIR%
echo IIS web.config 目錄：部署根目錄\%IIS_SUBDIR%
echo.
set /p DEPLOY_ROOT="目標路徑: "

if not defined DEPLOY_ROOT (
    echo [Status] Failed
    echo [Root Cause] 未輸入目標路徑。
    echo [Suggested Fix] 重新執行 _deploy.bat，並輸入部署根目錄，例如 C:\DMS。
    goto fail
)

if "!DEPLOY_ROOT:~-1!"=="\" set "DEPLOY_ROOT=!DEPLOY_ROOT:~0,-1!"

set "APP_TARGET=!DEPLOY_ROOT!\%APP_SUBDIR%"
set "IIS_TARGET=!DEPLOY_ROOT!\%IIS_SUBDIR%"
set "WEB_CONFIG=!IIS_TARGET!\web.config"

echo.
echo [INFO] 部署根目錄：!DEPLOY_ROOT!
echo [INFO] App 目錄：!APP_TARGET!
echo [INFO] IIS 目錄：!IIS_TARGET!
echo.

call :CheckTools
if errorlevel 1 goto fail

call :CheckProject
if errorlevel 1 goto fail

echo [1/5] 準備目標目錄...
if not exist "!DEPLOY_ROOT!\" mkdir "!DEPLOY_ROOT!"
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] 無法建立部署根目錄：!DEPLOY_ROOT!
    echo [Suggested Fix] 確認路徑格式、磁碟是否存在，以及目前帳號是否有寫入權限。
    goto fail
)

if not exist "!APP_TARGET!\" mkdir "!APP_TARGET!"
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] 無法建立 App 目錄：!APP_TARGET!
    echo [Suggested Fix] 確認目前帳號是否有目標路徑的寫入權限。
    goto fail
)

if not exist "!IIS_TARGET!\" mkdir "!IIS_TARGET!"
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] 無法建立 IIS 目錄：!IIS_TARGET!
    echo [Suggested Fix] 確認目前帳號是否有目標路徑的寫入權限。
    goto fail
)

echo [OK] 目標目錄已準備完成。
echo.

echo [2/5] 檢查前端相依套件...
pushd "%FRONTEND%"
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] 無法進入前端專案目錄：%FRONTEND%
    echo [Suggested Fix] 請從 V6 專案根目錄執行 _deploy.bat。
    goto fail
)

if exist "node_modules\" goto deps_ready
if exist "package-lock.json" goto install_ci

echo [INFO] 找不到 package-lock.json，改用 npm install。
call npm install
goto install_done

:install_ci
echo [INFO] 找不到 node_modules，執行 npm ci。
call npm ci

:install_done
if errorlevel 1 (
    popd
    echo [Status] Failed
    echo [Root Cause] 前端相依套件安裝失敗。
    echo [Suggested Fix] 確認網路、npm registry 與 package-lock.json 狀態後重試。
    goto fail
)

:deps_ready
echo [OK] 前端相依套件已就緒。
echo.

echo [3/5] 建置 Next.js standalone 成品...
call npm run build
if errorlevel 1 (
    popd
    echo [Status] Failed
    echo [Root Cause] Next.js 正式建置失敗。
    echo [Suggested Fix] 先修正上方 TypeScript 或 Next.js build 錯誤，再重新部署。
    goto fail
)

if not exist ".next\standalone\server.js" (
    popd
    echo [Status] Failed
    echo [Root Cause] 找不到 standalone 成品：%FRONTEND%\.next\standalone\server.js
    echo [Suggested Fix] 確認 next.config.mjs 內有 output: 'standalone'，並重新執行 npm run build。
    goto fail
)

if not exist ".next\BUILD_ID" (
    popd
    echo [Status] Failed
    echo [Root Cause] 找不到建置版本檔：%FRONTEND%\.next\BUILD_ID
    echo [Suggested Fix] 重新執行 npm run build，確認建置流程完整完成。
    goto fail
)

set /p SOURCE_BUILD_ID=<".next\BUILD_ID"
popd
echo [OK] Next.js 建置完成，BUILD_ID：!SOURCE_BUILD_ID!
echo.

echo [4/5] 複製 standalone 成品到目標目錄...
call :RoboCopyDir "%FRONTEND%\.next\standalone" "!APP_TARGET!" "/MIR" "/XF" ".env.production" "/XD" "storage"
if errorlevel 1 goto fail

call :RoboCopyDir "%FRONTEND%\.next\static" "!APP_TARGET!\.next\static" "/MIR"
if errorlevel 1 goto fail

call :RoboCopyDir "%FRONTEND%\public" "!APP_TARGET!\public" "/MIR"
if errorlevel 1 goto fail

if not exist "!APP_TARGET!\.env.production" (
    echo [WARN] 尚未建立正式環境設定檔：!APP_TARGET!\.env.production
    echo [WARN] 請依 dmsV6\.env.example 或參考文件\部署_IIS.md 建立正式資料庫與 Session 設定。
) else (
    echo [OK] 已保留正式環境設定檔：!APP_TARGET!\.env.production
)

if not exist "!WEB_CONFIG!" (
    call :CreateWebConfig
    if errorlevel 1 goto fail
) else (
    echo [OK] 已保留既有 IIS web.config：!WEB_CONFIG!
)
echo.

echo [5/5] 驗證複製結果...
if not exist "!APP_TARGET!\server.js" (
    echo [Status] Failed
    echo [Root Cause] 目標目錄缺少 server.js：!APP_TARGET!\server.js
    echo [Suggested Fix] 檢查 robocopy 輸出與目標目錄權限。
    goto fail
)

if not exist "!APP_TARGET!\.next\BUILD_ID" (
    echo [Status] Failed
    echo [Root Cause] 目標目錄缺少 BUILD_ID：!APP_TARGET!\.next\BUILD_ID
    echo [Suggested Fix] 檢查 standalone 複製流程是否完整。
    goto fail
)

set /p TARGET_BUILD_ID=<"!APP_TARGET!\.next\BUILD_ID"
if not "!SOURCE_BUILD_ID!"=="!TARGET_BUILD_ID!" (
    echo [Status] Failed
    echo [Root Cause] BUILD_ID 不一致。來源：!SOURCE_BUILD_ID!，目標：!TARGET_BUILD_ID!
    echo [Suggested Fix] 重新執行 _deploy.bat，並確認目標目錄沒有被其他程序同步或覆蓋。
    goto fail
)

echo [OK] BUILD_ID 驗證成功：!TARGET_BUILD_ID!
echo.
echo ===================================================
echo   部署完成
echo ===================================================
echo App 目錄：!APP_TARGET!
echo IIS 目錄：!IIS_TARGET!
echo.
echo(後續動作：
echo(1. 服務啟動目錄：!APP_TARGET!
echo(2. 服務環境變數：NODE_ENV=production、HOSTNAME=127.0.0.1、PORT=%DEFAULT_PORT%
echo(3. 啟動或重新啟動 Windows 服務
echo(4. 透過 IIS 網站驗證登入、上傳、預覽與下載
echo(
pause
endlocal
exit /b 0

:CheckTools
where node > nul 2> nul
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] 找不到 node。
    echo [Suggested Fix] 安裝 Node.js LTS，或將 Node.js 加入 PATH。
    exit /b 1
)

where npm > nul 2> nul
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] 找不到 npm。
    echo [Suggested Fix] 安裝 Node.js LTS，或將 npm 加入 PATH。
    exit /b 1
)

where robocopy > nul 2> nul
if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] 找不到 robocopy。
    echo [Suggested Fix] 請在 Windows 環境執行，或確認系統路徑包含 robocopy。
    exit /b 1
)

exit /b 0

:CheckProject
if not exist "%FRONTEND%\package.json" (
    echo [Status] Failed
    echo [Root Cause] 找不到前端 package.json：%FRONTEND%\package.json
    echo [Suggested Fix] 請從 V6 專案根目錄執行 _deploy.bat。
    exit /b 1
)

if not exist "%FRONTEND%\next.config.mjs" (
    echo [Status] Failed
    echo [Root Cause] 找不到 Next.js 設定檔：%FRONTEND%\next.config.mjs
    echo [Suggested Fix] 請確認目前目錄是 DMS V6 專案根目錄。
    exit /b 1
)

exit /b 0

:RoboCopyDir
set "ROBO_SOURCE=%~1"
set "ROBO_TARGET=%~2"
set "ROBO_OPT1=%~3"
set "ROBO_OPT2=%~4"
set "ROBO_OPT3=%~5"
set "ROBO_OPT4=%~6"
set "ROBO_OPT5=%~7"

if not exist "%ROBO_SOURCE%\" (
    echo [Status] Failed
    echo [Root Cause] 複製來源不存在：%ROBO_SOURCE%
    echo [Suggested Fix] 重新執行 npm run build，確認成品已產生。
    exit /b 1
)

robocopy "%ROBO_SOURCE%" "%ROBO_TARGET%" %ROBO_OPT1% %ROBO_OPT2% %ROBO_OPT3% %ROBO_OPT4% %ROBO_OPT5% /R:2 /W:2 /NP /NFL /NDL /NJH /NJS > nul 2> nul
if %ERRORLEVEL% LEQ 7 (
    echo [OK] 已同步：%ROBO_SOURCE% -^> %ROBO_TARGET%
    exit /b 0
)

echo [Status] Failed
echo [Root Cause] robocopy 複製失敗，代碼：%ERRORLEVEL%
echo [Suggested Fix] 檢查來源、目標權限、檔案是否被鎖定，以及磁碟空間。
exit /b 1

:CreateWebConfig
(
    echo ^<?xml version="1.0" encoding="UTF-8"?^>
    echo ^<configuration^>
    echo   ^<system.webServer^>
    echo     ^<rewrite^>
    echo       ^<rules^>
    echo         ^<rule name="DMS V6 reverse proxy" stopProcessing="true"^>
    echo           ^<match url="(.*)" /^>
    echo           ^<action type="Rewrite" url="http://127.0.0.1:%DEFAULT_PORT%/{R:1}" /^>
    echo         ^</rule^>
    echo       ^</rules^>
    echo     ^</rewrite^>
    echo     ^<proxy preserveHostHeader="true" reverseRewriteHostInResponseHeaders="false" /^>
    echo     ^<security^>
    echo       ^<requestFiltering^>
    echo         ^<requestLimits maxAllowedContentLength="1073741824" /^>
    echo       ^</requestFiltering^>
    echo     ^</security^>
    echo   ^</system.webServer^>
    echo ^</configuration^>
) > "!WEB_CONFIG!"

if errorlevel 1 (
    echo [Status] Failed
    echo [Root Cause] 無法建立 IIS web.config：!WEB_CONFIG!
    echo [Suggested Fix] 檢查 IIS 目錄寫入權限。
    exit /b 1
)

echo [OK] 已建立 IIS web.config：!WEB_CONFIG!
exit /b 0

:fail
echo.
echo [ABORTED] _deploy.bat 未完成。
pause
endlocal
exit /b 1
