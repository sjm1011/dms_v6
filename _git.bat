@echo off
for /f "tokens=4" %%i in ('chcp') do if not "%%i"=="65001" (
    chcp 65001 > nul
    cmd /c "%~f0" %*
    goto reinvoke_exit
)
:: 使用 UTF-8 編碼
chcp 65001 > nul
setlocal EnableExtensions EnableDelayedExpansion

:: 定義中文訊息變數，避免執行期 offset 錯誤
set "MSG_TITLE=  DMS - 本機 Git 備份"
set "MSG_ERR_NO_GIT=[錯誤] 找不到 Git，請先安裝 Git 並確認 git.exe 已加入 PATH。"
set "MSG_INFO_INIT=[資訊] 目前資料夾尚未初始化 Git，正在執行 git init..."
set "MSG_ERR_INIT=[錯誤] git init 失敗。"
set "MSG_INFO_NO_NAME=[資訊] 尚未設定 Git user.name，改用本專案預設值。"
set "MSG_INFO_NO_EMAIL=[資訊] 尚未設定 Git user.email，改用本專案預設值。"
set "MSG_WARN_NO_IGNORE=[警告] 找不到 .gitignore，請確認不會把 node_modules、dist、Win64 等產物提交進 Git。"
set "MSG_WARN_SUB_GIT=[警告] 偵測到 dmsV6\.git。"
set "MSG_WARN_SUB_GIT_HINT=       這代表 dmsV6 可能是另一個 Git repository，本腳本不會刪除或合併它。"
set "MSG_STEP_1=[1/4] 目前 Git 狀態："
set "MSG_ERR_STATUS=[錯誤] git status 失敗。"
set "MSG_SUCCESS_NO_CHANGES=[完成] 目前沒有檔案變更，不需要建立新的本機備份 commit。"
set "MSG_STEP_2=[2/4] 加入所有變更到暫存區 git add -A..."
set "MSG_ERR_ADD=[錯誤] git add -A 失敗。"
set "MSG_ERR_DIFF=[錯誤] git diff --cached 檢查失敗."
set "MSG_SUCCESS_NO_STAGED=[完成] 沒有可提交的 staged 變更。"
set "MSG_STEP_3=[3/4] 建立本機備份 commit："
set "MSG_ERR_COMMIT=[錯誤] git commit 失敗。"
set "MSG_STEP_4=[4/4] 最新本機備份："
set "MSG_SUCCESS=[成功] 已完成本機 Git 備份。"
set "MSG_SUCCESS_HINT=       本腳本不會自動推送到 GitHub；需要同步遠端時請另外執行 git push。"
set "MSG_ABORTED=[中止] 本機 Git 備份未完成。"

cd /d "%~dp0"

echo ===================================================
echo !MSG_TITLE!
echo ===================================================
echo.

where git >nul 2>&1
if not errorlevel 1 goto git_found
echo !MSG_ERR_NO_GIT!
goto fail
:git_found

git rev-parse --is-inside-work-tree >nul 2>&1
if not errorlevel 1 goto repo_ready

echo !MSG_INFO_INIT!
git init
if not errorlevel 1 goto init_ok
echo !MSG_ERR_INIT!
goto fail
:init_ok

:repo_ready
git config user.name >nul 2>&1
if not errorlevel 1 goto user_name_ready
echo !MSG_INFO_NO_NAME!
git config --local user.name "DMS Local Backup"

:user_name_ready
git config user.email >nul 2>&1
if not errorlevel 1 goto user_email_ready
echo !MSG_INFO_NO_EMAIL!
git config --local user.email "dms-local@example.com"

:user_email_ready
if not exist ".gitignore" echo !MSG_WARN_NO_IGNORE!

if exist "dmsV6\.git" echo !MSG_WARN_SUB_GIT!
if exist "dmsV6\.git" echo !MSG_WARN_SUB_GIT_HINT!

echo !MSG_STEP_1!
git status --short
if not errorlevel 1 goto status_ok
echo !MSG_ERR_STATUS!
goto fail
:status_ok

set "HAS_CHANGES="
for /f "delims=" %%s in ('git status --porcelain') do set "HAS_CHANGES=1"
if defined HAS_CHANGES goto changes_found

echo.
echo !MSG_SUCCESS_NO_CHANGES!
goto done

:changes_found
echo.
echo !MSG_STEP_2!
git add -A
if not errorlevel 1 goto add_ok
echo !MSG_ERR_ADD!
goto fail
:add_ok

git diff --cached --quiet --exit-code
if not errorlevel 2 goto diff_ok
echo !MSG_ERR_DIFF!
goto fail
:diff_ok
if errorlevel 1 goto staged_changes_ready

echo.
echo !MSG_SUCCESS_NO_STAGED!
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
echo !MSG_STEP_3!
echo       !COMMIT_MSG!
git commit -m "!COMMIT_MSG!"
if not errorlevel 1 goto commit_ok
echo !MSG_ERR_COMMIT!
goto fail
:commit_ok

echo.
echo !MSG_STEP_4!
git log -1 --oneline

echo.
echo !MSG_SUCCESS!
echo !MSG_SUCCESS_HINT!
goto done

:fail
echo.
echo !MSG_ABORTED!
if /I not "%DMS_GIT_NO_PAUSE%"=="1" pause
endlocal
exit /b 1

:done
echo.
if /I not "%DMS_GIT_NO_PAUSE%"=="1" pause
endlocal
exit /b 0

:reinvoke_exit
exit /b %errorlevel%
