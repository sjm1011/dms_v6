# 前端部署到 IIS 操作文件

## 1. 部署結論

V5 前端不再使用舊 Vite `dist` 靜態檔部署方式。正式部署到 IIS 時，正確架構如下：

```text
使用者瀏覽器
  ↓
IIS
  ↓
Next.js standalone server
  ↓
內部後端 API
  ↓
PostgreSQL
```

IIS 的角色是對外提供 HTTP 或 HTTPS 入口，並透過 URL Rewrite 與 ARR 將請求反向代理到本機的 Next.js standalone server。

## 2. 禁止使用的舊方式

- 不部署 `dms\dist`。
- 不部署 `dms\public\config.js` 作為正式環境設定來源。
- 不讓使用者瀏覽器直接連線到內部後端 API。
- 不在 IIS 內直接託管 Next.js 原始碼資料夾。

原因是 V5 已將登入狀態、後端 API 轉發、文件下載與 PDF 預覽移到 Next.js route handler。瀏覽器端只應呼叫同源的 Next.js 路由，不應知道內部後端 API 位址。

## 3. 相關檔案

| 檔案 | 用途 |
|---|---|
| `_iis.bat` | IIS 部署輔助入口，會呼叫 `_build_next_standalone.bat` 產生部署包，並提示 IIS 後續設定 |
| `_build_next_standalone.bat` | 建置 Next.js standalone 輸出，產生 `_deploy\nextjs` |
| `_start_next_standalone.bat` | 在正式主機啟動 Next.js standalone server |
| `deploy\iis\web.config` | IIS URL Rewrite 與 ARR 反向代理範本 |
| `deploy\env.production.sample` | 正式環境 `.env.production` 範本 |
| `_deploy\nextjs` | 建置後產生的前端部署包 |

## 4. 正式主機前置需求

- Windows Server 或可執行 IIS 的 Windows 主機。
- IIS 已安裝並建立網站。
- IIS 已安裝 URL Rewrite。
- IIS 已安裝 Application Request Routing，簡稱 ARR。
- ARR 已啟用 Proxy 功能。
- 正式主機已安裝 Node.js LTS runtime。
- 正式主機可連線到內部後端 API。
- 若 `SESSION_COOKIE_SECURE=true`，IIS 對外站台必須使用 HTTPS。

## 5. 在開發機產生部署包

在專案根目錄執行：

```bat
_iis.bat
```

`_iis.bat` 會檢查 `deploy\iis\web.config` 是否存在，並呼叫：

```bat
_build_next_standalone.bat
```

建置成功後會產生：

```text
_deploy\nextjs
```

部署到正式主機時，複製整個 `_deploy\nextjs` 資料夾即可。正式主機不需要執行 `npm install`，也不需要從 npm registry 下載套件。

## 6. 部署包目錄建議

正式主機可使用下列目錄結構：

```text
C:\DMS\nextjs
  app\
    server.js
    .next\
    public\
  _start_next_standalone.bat
  .env.production
```

其中 `C:\DMS\nextjs` 對應從開發機複製過來的 `_deploy\nextjs`。

## 7. 建立正式環境設定

在正式主機的部署包目錄中，將：

```text
.env.production.sample
```

複製成：

```text
.env.production
```

設定內容範例：

```text
BACKEND_API_BASE_URL=http://內部後端主機:8080
SESSION_COOKIE_NAME=dms_session
SESSION_SECRET=請改成至少 32 字元的隨機字串
SESSION_MAX_AGE_SECONDS=28800
SESSION_COOKIE_SECURE=true
DMS_NEXT_HOST=127.0.0.1
DMS_NEXT_PORT=3000
```

設定原則：

- `BACKEND_API_BASE_URL` 指向內部後端 API，不是 IIS 對外網址。
- `SESSION_SECRET` 必須更換為正式環境專用隨機字串。
- `DMS_NEXT_HOST` 建議固定為 `127.0.0.1`，避免 Next.js server 直接暴露到使用者網段。
- `DMS_NEXT_PORT` 預設為 `3000`。
- 若正式環境尚未啟用 HTTPS，`SESSION_COOKIE_SECURE` 必須先設為 `false`；啟用 HTTPS 後再改回 `true`。

## 8. 啟動 Next.js standalone server

在正式主機部署包目錄執行：

```bat
_start_next_standalone.bat
```

預設監聽位址為：

```text
127.0.0.1:3000
```

正式環境必須讓此程序長時間執行。可使用 Windows Service、工作排程器或既有服務管理工具控管啟動、停止與重啟。

## 9. IIS 網站設定

### 9.1 建立 IIS 站台

- 建立一個 IIS Website 作為 DMS 對外入口。
- Application Pool 可使用「No Managed Code」。
- 綁定正式網域、IP、port 與憑證。
- Site root 可使用獨立資料夾，例如：

```text
C:\inetpub\dms
```

### 9.2 放置 web.config

將專案內的：

```text
deploy\iis\web.config
```

複製到 IIS site root，例如：

```text
C:\inetpub\dms\web.config
```

目前範本內容會把所有外部請求轉送到：

```text
http://127.0.0.1:3000
```

若 `.env.production` 的 `DMS_NEXT_PORT` 不是 `3000`，必須同步修改 `web.config` 內的反向代理目標。

### 9.3 啟用 ARR Proxy

在 IIS Manager 中設定：

- 選取伺服器節點。
- 開啟 Application Request Routing Cache。
- 進入 Server Proxy Settings。
- 勾選 Enable proxy。
- 套用設定。

未啟用 ARR Proxy 時，URL Rewrite 規則存在也無法正常反向代理到 Next.js server。

## 10. 防火牆與網路規則

- 使用者瀏覽器只能連到 IIS 對外網址。
- Next.js standalone server 只監聽 `127.0.0.1:3000`。
- 內部後端 API 只允許 Next.js 主機或必要的管理網段連線。
- PostgreSQL 不對使用者網段開放。
- 若有 HTTPS，TLS 憑證終止點放在 IIS。

## 11. 部署後驗證

在正式主機本機確認 Next.js server：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/
```

在其他使用者電腦確認 IIS 對外網址：

```text
https://正式網域/
```

驗收項目：

- 首頁可開啟。
- 登入成功後使用 `HttpOnly Cookie` 保存 session。
- 瀏覽器端看不到 `BACKEND_API_BASE_URL`。
- 文件下載走 `/api/documents/download?version_id=...`。
- PDF 預覽走 `/api/documents/preview?version_id=...`。
- 使用者無法直接連線到內部後端 API。
- IIS access log 可看到使用者請求。
- Next.js server console 或服務日誌沒有連線後端 API 失敗訊息。

## 12. 常見錯誤處理

| Status | Root Cause | Suggested Fix |
|---|---|---|
| IIS 回傳 404 | `web.config` 未放在 IIS site root，或 IIS 站台實體路徑指錯 | 確認 IIS site root，並將 `deploy\iis\web.config` 複製到該目錄 |
| IIS 回傳 502 | Next.js standalone server 未啟動，或 port 與 `web.config` 不一致 | 執行 `_start_next_standalone.bat`，確認 `DMS_NEXT_PORT` 與 `web.config` 代理目標一致 |
| IIS rewrite 規則無效 | 未安裝 URL Rewrite 或 ARR Proxy 未啟用 | 安裝 URL Rewrite 與 ARR，並在 ARR Server Proxy Settings 啟用 Proxy |
| 登入後 Cookie 未保存 | `SESSION_COOKIE_SECURE=true` 但 IIS 未使用 HTTPS | 測試環境改成 `SESSION_COOKIE_SECURE=false`，正式 HTTPS 啟用後改回 `true` |
| 無法連線後端 API | `BACKEND_API_BASE_URL` 指向錯誤主機、port 或防火牆未開 | 在 Next.js 主機測試連線到內部後端 API，修正 `.env.production` 或防火牆 |
| 大檔案上傳失敗 | IIS request body 限制過小 | 調整 IIS requestFiltering 與相關上傳大小限制 |
| 正式主機找不到 node | 未安裝 Node.js LTS 或 PATH 未包含 Node.js | 安裝 Node.js LTS，並確認 `node --version` 可執行 |

## 13. 更新版本流程

- 在開發機執行 `_iis.bat` 重新產生 `_deploy\nextjs`。
- 停止正式主機上的 Next.js standalone server。
- 備份正式主機現有部署目錄與 `.env.production`。
- 用新的 `_deploy\nextjs` 內容更新正式主機部署目錄。
- 還原或保留正式主機原本的 `.env.production`。
- 啟動 `_start_next_standalone.bat`。
- 從 IIS 對外網址執行部署後驗證。

## 14. 回復流程

若新版本部署後失敗：

- 停止 Next.js standalone server。
- 將正式主機部署目錄還原為前一版備份。
- 確認 `.env.production` 為前一版可用設定。
- 啟動 `_start_next_standalone.bat`。
- 從 IIS 對外網址重新驗證登入、文件下載與 PDF 預覽。

IIS 的 `web.config` 在 port 與代理目標未變更時不需要回復。
