@echo off
:: 使用 UTF-8 編碼
chcp 65001 > nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

echo ===================================================
echo   DMS - 本機 Git 備份
echo ===================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 找不到 Git，請先安裝 Git 並確認 git.exe 已加入 PATH。
    goto fail
)

git rev-parse --is-inside-work-tree >nul 2>&1
if not errorlevel 1 goto repo_ready

echo [資訊] 目前資料夾尚未初始化 Git，正在執行 git init...
git init
if errorlevel 1 (
    echo [錯誤] git init 失敗。
    goto fail
)

:repo_ready
git config user.name >nul 2>&1
if not errorlevel 1 goto user_name_ready
echo [資訊] 尚未設定 Git user.name，改用本專案預設值。
git config --local user.name "DMS Local Backup"

:user_name_ready
git config user.email >nul 2>&1
if not errorlevel 1 goto user_email_ready
echo [資訊] 尚未設定 Git user.email，改用本專案預設值。
git config --local user.email "dms-local@example.com"

:user_email_ready
if not exist ".gitignore" (
    echo [警告] 找不到 .gitignore，請確認不會把 node_modules、dist、Win64 等產物提交進 Git。
)

if exist "dmsV6\.git" (
    echo [警告] 偵測到 dmsV6\.git。
    echo        這代表 dmsV6 可能是另一個 Git repository，本腳本不會刪除或合併它。
)

echo [1/4] 目前 Git 狀態：
git status --short
if errorlevel 1 (
    echo [錯誤] git status 失敗。
    goto fail
)

set "HAS_CHANGES="
for /f "delims=" %%s in ('git status --porcelain') do set "HAS_CHANGES=1"
if defined HAS_CHANGES goto changes_found

echo.
echo [完成] 目前沒有檔案變更，不需要建立新的本機備份 commit。
goto done

:changes_found
echo.
echo [2/4] 加入所有變更到暫存區 git add -A...
git add -A
if errorlevel 1 (
    echo [錯誤] git add -A 失敗。
    goto fail
)

git diff --cached --quiet --exit-code
if errorlevel 2 (
    echo [錯誤] git diff --cached 檢查失敗。
    goto fail
)
if errorlevel 1 goto staged_changes_ready

echo.
echo [完成] 沒有可提交的 staged 變更。
goto done

:staged_changes_ready
for /f "usebackq delims=" %%t in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"`) do set "NOW=%%t"

set "USER_MSG=%~1"
if defined USER_MSG (
    set "COMMIT_MSG=%USER_MSG%"
) else (
    set "COMMIT_MSG=Local backup: !NOW!"
)

echo.
echo [3/4] 建立本機備份 commit：
echo       !COMMIT_MSG!
git commit -m "!COMMIT_MSG!"
if errorlevel 1 (
    echo [錯誤] git commit 失敗。
    goto fail
)

echo.
echo [4/4] 最新本機備份：
git log -1 --oneline

echo.
echo [成功] 已完成本機 Git 備份。
echo        本腳本不會自動推送到 GitHub；需要同步遠端時請另外執行 git push。
goto done

:fail
echo.
echo [中止] 本機 Git 備份未完成。
if /I not "%DMS_GIT_NO_PAUSE%"=="1" pause
endlocal
exit /b 1

:done
echo.
if /I not "%DMS_GIT_NO_PAUSE%"=="1" pause
endlocal
exit /b 0
