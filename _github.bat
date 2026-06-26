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
set "MSG_TITLE=  DMS - GitHub 遠端備份"
set "MSG_ERR_NO_GIT=[錯誤] 找不到 Git，請先安裝 Git 並確認 git.exe 已加入 PATH。"
set "MSG_ERR_NOT_REPO=[錯誤] 目前資料夾不是 Git repository。"
set "MSG_ERR_NOT_REPO_HINT=       請先執行 _git.bat 建立本機 Git 備份。"
set "MSG_ERR_NOT_BRANCH=[錯誤] 目前不是一般分支狀態，無法推送到 GitHub。"
set "MSG_INFO_NO_ORIGIN=[資訊] 偵測到尚未設定 GitHub remote origin。"
set "MSG_INFO_SET_ORIGIN=       正在為您設定 remote origin 為 https://github.com/sjm1011/dms_v6.git..."
set "MSG_ERR_ADD_ORIGIN=[錯誤] 無法新增 GitHub remote origin。"
set "MSG_INFO_OLD_ORIGIN=[資訊] 偵測到 GitHub remote 為舊版或不同網址："
set "MSG_INFO_UPDATE_ORIGIN=       正在將目的地更新為新版網址：https://github.com/sjm1011/dms_v6.git..."
set "MSG_ERR_UPDATE_ORIGIN=[錯誤] 更新 GitHub remote 失敗。"
set "MSG_INFO_BRANCH=[資訊] 目前分支："
set "MSG_INFO_REMOTE=[資訊] GitHub remote："
set "MSG_INFO_UNCOMMITTED=[資訊] 偵測到尚未提交的檔案變更，先執行 _git.bat 建立本機備份 commit。"
set "MSG_ERR_NO_GIT_BAT=[錯誤] 找不到 _git.bat，無法自動建立本機備份 commit。"
set "MSG_ERR_GIT_BAT_FAIL=[錯誤] _git.bat 執行失敗，停止推送到 GitHub。"
set "MSG_ERR_STILL_CHANGES=[錯誤] _git.bat 執行後仍有未提交變更，停止推送到 GitHub。"
set "MSG_STEP_1=[1/3] 工作目錄乾淨，可以推送。"
set "MSG_STEP_2=[2/3] 本機尚未推送的 commit："
set "MSG_INFO_NO_TRACKING=[資訊] 尚未取得遠端追蹤分支，將直接推送 "
set "MSG_STEP_3=[3/3] 推送到 GitHub..."
set "MSG_ERR_PUSH_FAIL=[錯誤] git push 失敗。"
set "MSG_ERR_PUSH_HINT=       請確認 GitHub 權限、網路連線，或是否需要登入 Git Credential Manager。"
set "MSG_SUCCESS=[成功] 已推送到 GitHub."
set "MSG_ABORTED=[中止] GitHub 遠端備份未完成。"

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
echo !MSG_ERR_NOT_REPO!
echo !MSG_ERR_NOT_REPO_HINT!
goto fail

:repo_ready
for /f "usebackq delims=" %%b in (`git branch --show-current`) do set "BRANCH=%%b"
if defined BRANCH goto branch_ready
echo !MSG_ERR_NOT_BRANCH!
goto fail

:branch_ready
git remote get-url origin >nul 2>&1
if not errorlevel 1 goto origin_configured
echo !MSG_INFO_NO_ORIGIN!
echo !MSG_INFO_SET_ORIGIN!
git remote add origin https://github.com/sjm1011/dms_v6.git
if not errorlevel 1 goto origin_configured
echo !MSG_ERR_ADD_ORIGIN!
goto fail
:origin_configured

for /f "usebackq delims=" %%u in (`git remote get-url origin`) do set "ORIGIN_URL=%%u"

if "!ORIGIN_URL!"=="https://github.com/sjm1011/dms_v6" goto origin_url_ok
if "!ORIGIN_URL!"=="https://github.com/sjm1011/dms_v6.git" goto origin_url_ok
echo !MSG_INFO_OLD_ORIGIN!!ORIGIN_URL!
echo !MSG_INFO_UPDATE_ORIGIN!
git remote set-url origin https://github.com/sjm1011/dms_v6.git
if not errorlevel 1 goto origin_url_updated
echo !MSG_ERR_UPDATE_ORIGIN!
goto fail
:origin_url_updated
for /f "usebackq delims=" %%u in (`git remote get-url origin`) do set "ORIGIN_URL=%%u"
:origin_url_ok

echo !MSG_INFO_BRANCH!!BRANCH!
echo !MSG_INFO_REMOTE!!ORIGIN_URL!
echo.

set "HAS_CHANGES="
for /f "delims=" %%s in ('git status --porcelain') do set "HAS_CHANGES=1"
if not defined HAS_CHANGES goto clean_worktree

echo !MSG_INFO_UNCOMMITTED!
echo.
git status --short
echo.

if exist "%~dp0_git.bat" goto local_backup_ready
echo !MSG_ERR_NO_GIT_BAT!
goto fail

:local_backup_ready
set "BACKUP_MSG=%~1"
set "PREV_DMS_GIT_NO_PAUSE=%DMS_GIT_NO_PAUSE%"
set "DMS_GIT_NO_PAUSE=1"

if defined BACKUP_MSG goto run_git_with_message
call "%~dp0_git.bat"
goto local_backup_done

:run_git_with_message
call "%~dp0_git.bat" "!BACKUP_MSG!"

:local_backup_done
set "GIT_BACKUP_EXIT=!errorlevel!"
set "DMS_GIT_NO_PAUSE=%PREV_DMS_GIT_NO_PAUSE%"
if "!GIT_BACKUP_EXIT!"=="0" goto recheck_worktree

echo !MSG_ERR_GIT_BAT_FAIL!
goto fail

:recheck_worktree
set "HAS_CHANGES="
for /f "delims=" %%s in ('git status --porcelain') do set "HAS_CHANGES=1"
if not defined HAS_CHANGES goto clean_worktree

echo !MSG_ERR_STILL_CHANGES!
echo.
git status --short
goto fail

:clean_worktree
echo !MSG_STEP_1!
echo.

echo !MSG_STEP_2!
git log --oneline origin/!BRANCH!..!BRANCH! >nul 2>&1
if not errorlevel 1 goto show_local_commits
echo !MSG_INFO_NO_TRACKING!!BRANCH!。
goto local_commits_done
:show_local_commits
git log --oneline origin/!BRANCH!..!BRANCH!
:local_commits_done
echo.

echo !MSG_STEP_3!
git push -u origin !BRANCH!
if not errorlevel 1 goto push_ok
echo !MSG_ERR_PUSH_FAIL!
echo !MSG_ERR_PUSH_HINT!
goto fail
:push_ok

echo.
echo !MSG_SUCCESS!
git status -sb
goto done

:fail
echo.
echo !MSG_ABORTED!
if /I not "%DMS_GITHUB_NO_PAUSE%"=="1" pause
endlocal
exit /b 1

:done
echo.
if /I not "%DMS_GITHUB_NO_PAUSE%"=="1" pause
endlocal
exit /b 0

:reinvoke_exit
exit /b %errorlevel%
