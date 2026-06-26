$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  DMS - 本機 Git 備份" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# 檢查 Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[錯誤] 找不到 Git，請先安裝 Git 並確認 git.exe 已加入 PATH。" -ForegroundColor Red
    exit 1
}

# 檢查是否為 Repo
git rev-parse --is-inside-work-tree >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[資訊] 目前資料夾尚未初始化 Git，正在執行 git init..." -ForegroundColor Yellow
    git init
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[錯誤] git init 失敗。" -ForegroundColor Red
        exit 1
    }
}

# 設定 user.name
git config user.name >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[資訊] 尚未設定 Git user.name，改用本專案預設值。" -ForegroundColor Yellow
    git config --local user.name "DMS Local Backup"
}

# 設定 user.email
git config user.email >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[資訊] 尚未設定 Git user.email，改用本專案預設值。" -ForegroundColor Yellow
    git config --local user.email "dms-local@example.com"
}

# 檢查 .gitignore
if (-not (Test-Path ".gitignore")) {
    Write-Host "[警告] 找不到 .gitignore，請確認不會把 node_modules、dist 等產物提交進 Git。" -ForegroundColor Yellow
}

# 檢查子模組 git
if (Test-Path "dmsV6\.git") {
    Write-Host "[警告] 偵測到 dmsV6\.git。這代表 dmsV6 可能是獨立的 Git 版本庫，本腳本不會刪除或合併它。" -ForegroundColor Yellow
}

Write-Host "[1/4] 目前 Git 狀態：" -ForegroundColor Green
git status --short
if ($LASTEXITCODE -ne 0) {
    Write-Host "[錯誤] git status 失敗。" -ForegroundColor Red
    exit 1
}

# 檢查變更
$status = git status --porcelain
if ([string]::IsNullOrEmpty($status)) {
    Write-Host ""
    Write-Host "[完成] 目前沒有檔案變更，不需要建立新的本機備份 commit。" -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "[2/4] 加入所有變更到暫存區 git add -A..." -ForegroundColor Green
git add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "[錯誤] git add -A 失敗。" -ForegroundColor Red
    exit 1
}

git diff --cached --quiet --exit-code
$diffExit = $LASTEXITCODE
if ($diffExit -eq 2) {
    Write-Host "[錯誤] git diff --cached 檢查失敗。" -ForegroundColor Red
    exit 1
}
if ($diffExit -eq 0) {
    Write-Host ""
    Write-Host "[完成] 沒有可提交的 staged 變更。" -ForegroundColor Green
    exit 0
}

# 取得目前時間
$now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$commitMsg = $args[0]
if ([string]::IsNullOrEmpty($commitMsg)) {
    $commitMsg = "Local backup: $now"
}

Write-Host ""
Write-Host "[3/4] 建立本機備份 commit：" -ForegroundColor Green
Write-Host "      $commitMsg" -ForegroundColor Yellow
git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) {
    Write-Host "[錯誤] git commit 失敗。" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[4/4] 最新本機備份：" -ForegroundColor Green
git log -1 --oneline

Write-Host ""
Write-Host "[成功] 已完成本機 Git 備份。" -ForegroundColor Green
Write-Host "       本腳本不會自動推送到 GitHub；需要同步遠端時請另外執行 git push 或 _github.bat。"
