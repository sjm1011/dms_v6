# DMS V6 Windows 部署：Nginx

## 1. 架構與限制

```text
瀏覽器 -> Nginx HTTPS 443 -> http://127.0.0.1:3000 -> Next.js -> PostgreSQL
```

Nginx for Windows 可作為反向代理，但官方 Windows 版本以主控台應用程式執行，不原生提供 Windows Service 管理。正式環境若必須使用 Nginx，需使用組織核准的 Service Wrapper 管理 `nginx.exe`，並測試服務停止、重新載入與失敗復原流程。

## 2. 前置條件

1. 安裝組織核准的 Nginx Windows 版本，例如放置於 `C:\nginx`。
2. 安裝 Node.js LTS。
3. 完成 PostgreSQL 部署。
4. 準備正式網域與 PEM 格式憑證。

## 3. 部署 Next.js standalone

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

Node.js Windows 服務執行：

```text
執行檔：C:\Program Files\nodejs\node.exe
參數：C:\DMS\app\server.js
啟動目錄：C:\DMS\app
```

服務環境變數至少包含：

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

## 4. nginx.conf

將 `C:\nginx\conf\nginx.conf` 的 `http` 區段設定為包含下列內容：

```nginx
http {
    include       mime.types;
    default_type  application/octet-stream;

    sendfile on;
    keepalive_timeout 65;
    client_max_body_size 1g;

    upstream dms_v6 {
        server 127.0.0.1:3000;
        keepalive 32;
    }

    server {
        listen 80;
        server_name dms.example.com;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name dms.example.com;

        ssl_certificate     C:/nginx/conf/certs/dms-fullchain.pem;
        ssl_certificate_key C:/nginx/conf/certs/dms-private-key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;

        location / {
            proxy_pass http://dms_v6;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Port $server_port;
            proxy_connect_timeout 5s;
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;
            proxy_request_buffering off;
        }
    }
}
```

`client_max_body_size` 範例為 `1 GB`。必須依正式上傳政策調整。

## 5. 設定檢查與重新載入

```powershell
Set-Location C:\nginx
.\nginx.exe -t
.\nginx.exe
.\nginx.exe -s reload
```

正常停止：

```powershell
Set-Location C:\nginx
.\nginx.exe -s quit
```

不可直接結束所有 `nginx.exe` 程序作為正常更新流程，否則進行中的上傳或下載會被中斷。

## 6. Windows 服務管理

使用組織核准的 NSSM、WinSW 或其他 Service Wrapper 時，服務必須符合：

* 執行檔：`C:\nginx\nginx.exe`
* 啟動目錄：`C:\nginx`
* 啟動類型：Automatic
* 失敗復原：重新啟動服務
* 服務帳號：只能讀取 Nginx 程式與憑證的專用帳號

Node.js 與 Nginx 應建立為兩個獨立服務。Nginx 服務不應取得 PostgreSQL 密碼或 `C:\DMS\storage` 寫入權限。

## 7. 驗證

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/
Invoke-WebRequest -UseBasicParsing https://dms.example.com/
Invoke-WebRequest -UseBasicParsing https://dms.example.com/api/test
```

再以瀏覽器驗證登入、上傳、預覽與下載。

## 8. 常見錯誤

### 8.1 nginx -t 失敗

* Status：設定檢查失敗。
* Root Cause：Windows 路徑、憑證檔案、區塊括號或指令位置錯誤。
* Suggested Fix：以 `nginx.exe -t` 顯示的檔案與行號修正，不要在語法未通過時重新載入。

### 8.2 回傳 502 Bad Gateway

* Status：Nginx `502`。
* Root Cause：Node.js 服務未啟動，或 Nginx 無法連線至 `127.0.0.1:3000`。
* Suggested Fix：先直接測試 Node.js URL，再檢查 `logs/error.log` 與 `upstream` 設定。

### 8.3 回傳 413 Request Entity Too Large

* Status：Nginx `413`。
* Root Cause：`client_max_body_size` 小於上傳內容。
* Suggested Fix：依正式政策調整大小，執行 `nginx.exe -t` 後再重新載入。
