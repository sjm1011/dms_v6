@echo off
chcp 65001 >nul
setlocal EnableExtensions

:: 切換到批次檔所在的專案目錄。
cd /d "%~dp0"

echo ==================================================
echo   DMS - 從 GitHub 同步至本機
echo ==================================================
echo.

:: 確認 Git 已安裝且可由命令列執行。
where git >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 找不到 Git，請先安裝 Git 並將 git.exe 加入 PATH。
    goto fail
)

:: 確認目前目錄是 Git 儲存庫。
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 此目錄不是 Git 儲存庫：%CD%
    goto fail
)

:: 取得目前分支，分離式 HEAD 狀態不允許自動同步。
for /f "usebackq delims=" %%b in (`git branch --show-current`) do set "BRANCH=%%b"
if not defined BRANCH (
    echo [錯誤] 目前不是一般分支，請先切換至要同步的分支。
    goto fail
)

:: 確認 GitHub 遠端 origin 已設定。
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 找不到遠端 origin，請先設定 GitHub 儲存庫網址。
    goto fail
)

for /f "usebackq delims=" %%u in (`git remote get-url origin`) do set "ORIGIN_URL=%%u"

echo [資訊] 本機分支：%BRANCH%
echo [資訊] 遠端位置：%ORIGIN_URL%
echo.

:: 為避免覆蓋本機資料，只允許在工作目錄完全乾淨時同步。
set "HAS_CHANGES="
for /f "delims=" %%s in ('git status --porcelain') do set "HAS_CHANGES=1"
if defined HAS_CHANGES (
    echo [錯誤] 本機有未提交或未追蹤的檔案，同步已停止。
    echo.
    git status --short
    echo.
    echo [處理方式] 請先提交、暫存或移除上述異動，再重新執行。
    goto fail
)

echo [1/2] 正在取得 GitHub 的最新資料...
git fetch origin "%BRANCH%"
if errorlevel 1 (
    echo [錯誤] 無法從 GitHub 取得分支 %BRANCH%。
    echo [處理方式] 請檢查網路、儲存庫權限及登入憑證。
    goto fail
)

echo.
echo [2/2] 正在以快轉模式更新本機檔案...
git merge --ff-only "origin/%BRANCH%"
if errorlevel 1 (
    echo [錯誤] 本機與 GitHub 分支已分岔，無法安全地自動同步。
    echo [處理方式] 請先人工處理本機提交，再重新執行。
    goto fail
)

echo.
echo [完成] 本機檔案已同步至 GitHub 分支 %BRANCH% 的最新版本。
git status -sb
goto done

:fail
echo.
echo [中止] 未變更本機檔案。
if /I not "%DMS_GITHUB_SYNC_NO_PAUSE%"=="1" pause
endlocal
exit /b 1

:done
echo.
if /I not "%DMS_GITHUB_SYNC_NO_PAUSE%"=="1" pause
endlocal
exit /b 0
