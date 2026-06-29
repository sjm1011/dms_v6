# DMS V6 Windows 部署：Apache HTTP Server

## 1. 架構

Apache HTTP Server for Windows 負責 HTTPS 與反向代理。Next.js standalone 由獨立的 Node.js Windows 服務執行，僅監聽 `127.0.0.1:3000`。

```text
瀏覽器 -> Apache HTTPS 443 -> http://127.0.0.1:3000 -> Next.js -> PostgreSQL
```

## 2. 前置條件

1. 安裝組織核准的 Apache HTTP Server 2.4 Windows 發行版。
2. 安裝 Node.js LTS。
3. 完成 PostgreSQL 部署。
4. 準備正式網域與憑證檔案。

## 3. 部署 Next.js standalone

在原始碼主機執行：

```powershell
Set-Location D:\.我的專案\04.文件管理系統_V6_codex\dmsV6
npm ci
npm run build
New-Item -ItemType Directory -Force C:\DMS\app | Out-Null
New-Item -ItemType Directory -Force C:\DMS\storage | Out-Null
Copy-Item -Recurse -Force .next\standalone\* C:\DMS\app\
Copy-Item -Recurse -Force .next\static C:\DMS\app\.next\static
Copy-Item -Recurse -Force public C:\DMS\app\public
```

Node.js Windows 服務的執行檔、參數與啟動目錄分別為：

```text
C:\Program Files\nodejs\node.exe
C:\DMS\app\server.js
C:\DMS\app
```

服務需設定 `NODE_ENV=production`、`HOSTNAME=127.0.0.1`、`PORT=3000`、`DATABASE_URL`、`DMS_STORAGE_ROOT=C:\DMS\storage`、`SESSION_SECRET`、`SESSION_MAX_AGE_SECONDS=28800` 與 `SESSION_COOKIE_SECURE=true`。

## 4. 啟用 Apache 模組

確認 `httpd.conf` 已載入：

```apache
LoadModule headers_module modules/mod_headers.so
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule ssl_module modules/mod_ssl.so
LoadModule socache_shmcb_module modules/mod_socache_shmcb.so
```

若前方還有其他 Proxy，才需要額外評估 `mod_remoteip`。不可在未限制可信 Proxy IP 的情況下直接信任外部傳入的轉送標頭。

## 5. VirtualHost 設定

在 Apache 的站台設定檔加入：

```apache
<VirtualHost *:80>
    ServerName dms.example.com
    Redirect permanent / https://dms.example.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName dms.example.com

    SSLEngine on
    SSLCertificateFile "C:/Apache24/conf/certs/dms.crt"
    SSLCertificateKeyFile "C:/Apache24/conf/certs/dms.key"

    ProxyRequests Off
    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3000/ connectiontimeout=5 timeout=300
    ProxyPassReverse / http://127.0.0.1:3000/

    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"

    LimitRequestBody 1073741824

    ErrorLog  "logs/dms-error.log"
    CustomLog "logs/dms-access.log" combined
</VirtualHost>
```

`LimitRequestBody` 範例為 `1 GB`。必須依正式政策調整。Apache 2.4 的不同修訂版對允許值範圍可能不同，部署時必須以 `httpd -t` 驗證目前版本。

## 6. 設定檢查與服務重啟

```powershell
Set-Location C:\Apache24\bin
.\httpd.exe -t
.\httpd.exe -k restart
```

若 Apache 尚未安裝成 Windows 服務：

```powershell
.\httpd.exe -k install -n "Apache2.4-DMS"
Start-Service "Apache2.4-DMS"
```

## 7. 驗證

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/
Invoke-WebRequest -UseBasicParsing https://dms.example.com/
Invoke-WebRequest -UseBasicParsing https://dms.example.com/api/test
```

再以瀏覽器驗證登入、上傳、預覽與下載。

## 8. 常見錯誤

### 8.1 Apache 無法啟動

* Status：Windows 服務啟動後立即停止。
* Root Cause：模組未載入、憑證路徑錯誤、設定語法錯誤或 `443` 已被占用。
* Suggested Fix：執行 `httpd.exe -t`，再用 `Get-NetTCPConnection -LocalPort 443 -State Listen` 查明占用程序。

### 8.2 回傳 503 Service Unavailable

* Status：Apache `503`。
* Root Cause：Node.js 服務未啟動或 `127.0.0.1:3000` 無監聽。
* Suggested Fix：先直接測試 Node.js URL，再檢查 `ProxyPass` 目標。

### 8.3 大檔案上傳失敗

* Status：上傳被 Apache 拒絕或逾時。
* Root Cause：`LimitRequestBody`、Proxy timeout 或組織網路設備限制小於檔案大小。
* Suggested Fix：逐層檢查 Apache 錯誤日誌、反向代理限制及上游設備限制，不可只修改應用程式。
