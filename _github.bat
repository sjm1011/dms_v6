@echo off
:: 使用 UTF-8 編碼
chcp 65001 > nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

echo ===================================================
echo   DMS - GitHub 遠端備份
echo ===================================================
echo.

where git >nul 2>&1
if not errorlevel 1 goto git_found
echo [錯誤] 找不到 Git，請先安裝 Git 並確認 git.exe 已加入 PATH。
goto fail
:git_found

git rev-parse --is-inside-work-tree >nul 2>&1
if not errorlevel 1 goto repo_ready
echo [錯誤] 目前資料夾不是 Git repository。
echo        請先執行 _git.bat 建立本機 Git 備份。
goto fail

:repo_ready
for /f "usebackq delims=" %%b in (`git branch --show-current`) do set "BRANCH=%%b"
if defined BRANCH goto branch_ready
echo [錯誤] 目前不是一般分支狀態，無法推送到 GitHub。
goto fail

:branch_ready
git remote get-url origin >nul 2>&1
if not errorlevel 1 goto origin_configured
echo [資訊] 偵測到尚未設定 GitHub remote origin。
echo        正在為您設定 remote origin 為 https://github.com/sjm1011/dms_v6.git...
git remote add origin https://github.com/sjm1011/dms_v6.git
if not errorlevel 1 goto origin_configured
echo [錯誤] 無法新增 GitHub remote origin。
goto fail
:origin_configured

for /f "usebackq delims=" %%u in (`git remote get-url origin`) do set "ORIGIN_URL=%%u"

if "!ORIGIN_URL!"=="https://github.com/sjm1011/dms_v6" goto origin_url_ok
if "!ORIGIN_URL!"=="https://github.com/sjm1011/dms_v6.git" goto origin_url_ok
echo [資訊] 偵測到 GitHub remote 為舊版或不同網址：!ORIGIN_URL!
echo        正在將目的地更新為新版網址：https://github.com/sjm1011/dms_v6.git...
git remote set-url origin https://github.com/sjm1011/dms_v6.git
if not errorlevel 1 goto origin_url_updated
echo [錯誤] 更新 GitHub remote 失敗。
goto fail
:origin_url_updated
for /f "usebackq delims=" %%u in (`git remote get-url origin`) do set "ORIGIN_URL=%%u"
:origin_url_ok

echo [資訊] 目前分支：!BRANCH!
echo [資訊] GitHub remote：!ORIGIN_URL!
echo.

set "HAS_CHANGES="
for /f "delims=" %%s in ('git status --porcelain') do set "HAS_CHANGES=1"
if not defined HAS_CHANGES goto clean_worktree

echo [資訊] 偵測到尚未提交的檔案變更，先執行 _git.bat 建立本機備份 commit。
echo.
git status --short
echo.

if exist "%~dp0_git.bat" goto local_backup_ready
echo [錯誤] 找不到 _git.bat，無法自動建立本機備份 commit。
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

echo [錯誤] _git.bat 執行失敗，停止推送到 GitHub。
goto fail

:recheck_worktree
set "HAS_CHANGES="
for /f "delims=" %%s in ('git status --porcelain') do set "HAS_CHANGES=1"
if not defined HAS_CHANGES goto clean_worktree

echo [錯誤] _git.bat 執行後仍有未提交變更，停止推送到 GitHub。
echo.
git status --short
goto fail

:clean_worktree
echo [1/3] 工作目錄乾淨，可以推送。
echo.

echo [2/3] 本機尚未推送的 commit：
git log --oneline origin/!BRANCH!..!BRANCH! >nul 2>&1
if not errorlevel 1 goto show_local_commits
echo [資訊] 尚未取得遠端追蹤分支，將直接推送 !BRANCH!。
goto local_commits_done
:show_local_commits
git log --oneline origin/!BRANCH!..!BRANCH!
:local_commits_done
echo.

echo [3/3] 推送到 GitHub...
git push -u origin !BRANCH!
if not errorlevel 1 goto push_ok
echo [錯誤] git push 失敗。
echo        請確認 GitHub 權限、網路連線，或是否需要登入 Git Credential Manager。
goto fail
:push_ok

echo.
echo [成功] 已推送到 GitHub.
git status -sb
goto done

:fail
echo.
echo [中止] GitHub 遠端備份未完成。
if /I not "%DMS_GITHUB_NO_PAUSE%"=="1" pause
endlocal
exit /b 1

:done
echo.
if /I not "%DMS_GITHUB_NO_PAUSE%"=="1" pause
endlocal
exit /b 0
