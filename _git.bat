@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

echo ===================================================
echo   DMS - Local Git Backup
echo ===================================================
echo.

where git >nul 2>&1
if not errorlevel 1 goto check_repo
echo [ERROR] Git is not found. Please install Git and add it to PATH.
goto fail

:check_repo
git rev-parse --is-inside-work-tree >nul 2>&1
if not errorlevel 1 goto repo_ready

echo [INFO] Git repository not initialized. Running git init...
git init
if not errorlevel 1 goto repo_ready
echo [ERROR] git init failed.
goto fail

:repo_ready
git config user.name >nul 2>&1
if not errorlevel 1 goto user_name_ready
echo [INFO] Git user.name not set. Using default value.
git config --local user.name "DMS Local Backup"

:user_name_ready
git config user.email >nul 2>&1
if not errorlevel 1 goto user_email_ready
echo [INFO] Git user.email not set. Using default value.
git config --local user.email "dms-local@example.com"

:user_email_ready
if exist ".gitignore" goto check_submodule
echo [WARNING] .gitignore not found. Please ensure node_modules/dist are ignored.

:check_submodule
if not exist "dmsV6\.git" goto check_status
echo [WARNING] dmsV6\.git detected. It will be treated as a separate repository.

:check_status
echo [1/4] Current Git Status:
git status --short
if not errorlevel 1 goto parse_changes
echo [ERROR] git status failed.
goto fail

:parse_changes
set "HAS_CHANGES="
for /f "delims=" %%s in ('git status --porcelain') do set "HAS_CHANGES=1"
if defined HAS_CHANGES goto changes_found

echo.
echo [SUCCESS] No changes detected. Local backup is not required.
goto done

:changes_found
echo.
echo [2/4] Staging changes: git add -A...
git add -A
if not errorlevel 1 goto check_staged
echo [ERROR] git add -A failed.
goto fail

:check_staged
git diff --cached --quiet --exit-code
if errorlevel 2 goto staged_error
if errorlevel 1 goto staged_changes_ready

echo.
echo [SUCCESS] No changes staged.
goto done

:staged_error
echo [ERROR] git diff --cached failed.
goto fail

:staged_changes_ready
for /f "usebackq delims=" %%t in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"`) do set "NOW=%%t"

set "USER_MSG=%~1"
if defined USER_MSG goto set_user_msg
set "COMMIT_MSG=Local backup: !NOW!"
goto do_commit

:set_user_msg
set "COMMIT_MSG=%USER_MSG%"

:do_commit
echo.
echo [3/4] Creating local backup commit:
echo       !COMMIT_MSG!
git commit -m "!COMMIT_MSG!"
if not errorlevel 1 goto show_log
echo [ERROR] git commit failed.
goto fail

:show_log
echo.
echo [4/4] Latest backup commit:
git log -1 --oneline

echo.
echo [SUCCESS] Local Git backup completed.
echo           This script does not push to GitHub. Run git push manually if needed.
goto done

:fail
echo.
echo [ABORT] Local Git backup failed.
if /I not "%DMS_GIT_NO_PAUSE%"=="1" pause
endlocal
exit /b 1

:done
echo.
if /I not "%DMS_GIT_NO_PAUSE%"=="1" pause
endlocal
exit /b 0
