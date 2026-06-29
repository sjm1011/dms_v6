# DMS V6 Windows 部署：IIS

## 1. 架構

```text
瀏覽器
  -> HTTPS 443
  -> IIS、URL Rewrite、ARR
  -> http://127.0.0.1:3000
  -> Next.js standalone Node.js 服務
  -> PostgreSQL 與 C:\DMS\storage
```

IIS 不直接執行 Next.js。IIS 負責 TLS、主機名稱與反向代理，Node.js 服務負責頁面及 `/api` 路由。

## 2. 前置條件

1. Windows Server 已啟用 IIS。
2. 安裝 Node.js LTS，版本須符合 Next.js 16 的執行需求。
3. 安裝 IIS URL Rewrite 與 Application Request Routing（ARR）。只有 URL Rewrite 而沒有 ARR，無法完成 HTTP 反向代理。
4. PostgreSQL 已依「DMS V6 Windows 部署：PostgreSQL 資料庫」完成。
5. 準備正式網域名稱與伺服器憑證。

## 3. 建置與整理 standalone 成品

在原始碼主機執行：

```powershell
Set-Location D:\.我的專案\04.文件管理系統_V6_codex\dmsV6
npm ci
npm run build
```

建立正式部署目錄：

```powershell
New-Item -ItemType Directory -Force C:\DMS\app | Out-Null
New-Item -ItemType Directory -Force C:\DMS\storage | Out-Null
Copy-Item -Recurse -Force .next\standalone\* C:\DMS\app\
Copy-Item -Recurse -Force .next\static C:\DMS\app\.next\static
Copy-Item -Recurse -Force public C:\DMS\app\public
```

更新版本時只替換 `C:\DMS\app`。不可刪除或覆蓋 `C:\DMS\storage`。

## 4. Node.js 正式環境變數

執行 Node.js 的 Windows 服務帳號必須取得下列變數：

```text
NODE_ENV=production
HOSTNAME=127.0.0.1
PORT=3000
DATABASE_URL=postgres://dms_app:URL編碼後的密碼@127.0.0.1:5432/dms
PGPOOL_MAX=10
DMS_STORAGE_ROOT=C:\DMS\storage
SESSION_COOKIE_NAME=dms_session
SESSION_SECRET=至少32字元且只供正式環境使用的隨機字串
SESSION_MAX_AGE_SECONDS=28800
SESSION_COOKIE_SECURE=true
```

若對外入口尚未啟用 HTTPS，測試期間必須設為 `SESSION_COOKIE_SECURE=false`，否則瀏覽器不會透過 HTTP 回傳登入 Cookie。正式環境必須使用 HTTPS 並改回 `true`。

## 5. 將 Node.js 設為 Windows 服務

使用組織核准的 Windows Service Wrapper，例如 NSSM 或 WinSW。服務設定必須符合：

* 執行檔：`C:\Program Files\nodejs\node.exe`
* 參數：`C:\DMS\app\server.js`
* 啟動目錄：`C:\DMS\app`
* 啟動類型：Automatic
* 失敗復原：重新啟動服務
* 服務帳號：專用低權限帳號

該帳號只需擁有 `C:\DMS\app` 的讀取與執行權限，以及 `C:\DMS\storage` 的修改權限。不得授予本機系統管理員權限。

啟動後驗證：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/test
```

## 6. 建立 IIS 網站

1. 建立應用程式集區 `DMS_V6`。
2. `.NET CLR version` 設為 `No Managed Code`。
3. `Managed pipeline mode` 設為 `Integrated`。
4. 建立網站 `DMS_V6`，實體路徑可設為 `C:\DMS\iis-root`。
5. 綁定正式主機名稱與 HTTPS `443` 憑證。
6. 在 ARR 的伺服器層級設定中啟用 `Enable proxy`。

## 7. web.config

在 `C:\DMS\iis-root\web.config` 建立：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="DMS V6 reverse proxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:3000/{R:1}" />
        </rule>
      </rules>
    </rewrite>
    <proxy preserveHostHeader="true" reverseRewriteHostInResponseHeaders="false" />
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="1073741824" />
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
```

`maxAllowedContentLength` 範例為 `1 GB`。此值必須依組織允許的單檔上傳上限調整。

## 8. 驗證

```powershell
Invoke-WebRequest -UseBasicParsing https://dms.example.com/
Invoke-WebRequest -UseBasicParsing https://dms.example.com/api/test
```

完整驗證必須包含登入、建立資料夾、上傳文件、預覽及下載。

## 9. 常見錯誤

### 9.1 IIS 回傳 500.19

* Status：IIS `500.19`。
* Root Cause：URL Rewrite 或 ARR 未安裝，或 `web.config` 節點無法被目前 IIS 模組解析。
* Suggested Fix：先確認 IIS 管理員中存在 URL Rewrite 與 Application Request Routing，再檢查 `applicationHost.config` 的模組載入狀態。

### 9.2 IIS 回傳 502.3

* Status：IIS `502.3 Bad Gateway`。
* Root Cause：Node.js Windows 服務未啟動，或未監聽 `127.0.0.1:3000`。
* Suggested Fix：先直接請求 `http://127.0.0.1:3000/`，確認服務與連接埠，再檢查 ARR。

### 9.3 登入成功後仍回到登入頁

* Status：登入狀態未保留。
* Root Cause：HTTP 環境使用 `SESSION_COOKIE_SECURE=true`，瀏覽器拒絕回傳 Secure Cookie。
* Suggested Fix：正式站啟用 HTTPS；僅在隔離測試環境暫設 `SESSION_COOKIE_SECURE=false`。
