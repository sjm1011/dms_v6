$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  DMS - GitHub 遠端備份" -ForegroundColor Cyan
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
    Write-Host "[錯誤] 目前資料夾不是 Git 版本庫。請先執行 _git.bat 建立本機 Git 備份。" -ForegroundColor Red
    exit 1
}

# 取得目前分支
$branch = git branch --show-current
if ([string]::IsNullOrEmpty($branch)) {
    Write-Host "[錯誤] 目前不是一般分支狀態，無法推送到 GitHub。" -ForegroundColor Red
    exit 1
}

# 處理 remote
git remote get-url origin >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[資訊] 偵測到尚未設定 GitHub remote origin。" -ForegroundColor Yellow
    Write-Host "       正在為您設定 remote origin 為 https://github.com/sjm1011/dms_v6.git..." -ForegroundColor Yellow
    git remote add origin https://github.com/sjm1011/dms_v6.git
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[錯誤] 無法新增 GitHub remote origin。" -ForegroundColor Red
        exit 1
    }
} else {
    $originUrl = git remote get-url origin
    if ($originUrl -ne "https://github.com/sjm1011/dms_v6" -and $originUrl -ne "https://github.com/sjm1011/dms_v6.git") {
        Write-Host "[資訊] 偵測到 GitHub remote 為其他網址：$originUrl" -ForegroundColor Yellow
        Write-Host "       正在將目的地更新為新版網址：https://github.com/sjm1011/dms_v6.git..." -ForegroundColor Yellow
        git remote set-url origin https://github.com/sjm1011/dms_v6.git
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[錯誤] 更新 GitHub remote 失敗。" -ForegroundColor Red
            exit 1
        }
    }
}

$originUrl = git remote get-url origin
Write-Host "[資訊] 目前分支：$branch"
Write-Host "[資訊] GitHub 遠端庫：$originUrl"
Write-Host ""

# 檢查未提交變更
$status = git status --porcelain
if (-not [string]::IsNullOrEmpty($status)) {
    Write-Host "[資訊] 偵測到尚未提交的檔案變更，先執行 _git.bat 建立本機備份 commit。" -ForegroundColor Yellow
    Write-Host ""
    git status --short
    Write-Host ""
    
    if (-not (Test-Path "_git.bat")) {
        Write-Host "[錯誤] 找不到 _git.bat，無法自動建立本機備份 commit。" -ForegroundColor Red
        exit 1
    }
    
    $backupMsg = $args[0]
    $env:DMS_GIT_NO_PAUSE = "1"
    if (-not [string]::IsNullOrEmpty($backupMsg)) {
        & "$PSScriptRoot\_git.ps1" $backupMsg
    } else {
        & "$PSScriptRoot\_git.ps1"
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[錯誤] _git.bat 執行失敗，停止推送到 GitHub。" -ForegroundColor Red
        exit 1
    }
    
    # 再次檢查
    $statusAfter = git status --porcelain
    if (-not [string]::IsNullOrEmpty($statusAfter)) {
        Write-Host "[錯誤] 本機備份後仍有未提交變更，停止推送到 GitHub。" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[1/3] 工作目錄乾淨，可以推送。" -ForegroundColor Green
Write-Host ""

Write-Host "[2/3] 本機尚未推送的 commit：" -ForegroundColor Green
git log --oneline origin/$branch..$branch >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[資訊] 尚未取得遠端追蹤分支，將直接推送 $branch。" -ForegroundColor Yellow
} else {
    git log --oneline origin/$branch..$branch
}
Write-Host ""

Write-Host "[3/3] 推送到 GitHub..." -ForegroundColor Green
git push -u origin $branch
if ($LASTEXITCODE -ne 0) {
    Write-Host "[錯誤] git push 失敗。請確認 GitHub 權限、網路連線，或是否需要登入 Git Credential Manager。" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[成功] 已推送到 GitHub。" -ForegroundColor Green
git status -sb
