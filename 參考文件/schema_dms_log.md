# 資料表結構：dms_log (系統稽核紀錄)

本文件紀錄 DMS V6 之 `dms_log` 資料表結構定義。

本文件依據 `system_specifications.md` 第 1.5 節「資料表與欄位命名規則」與第 5 節「全域稽核紀錄規格」製作。資料表名稱與 schema 檔名一致，檔名前綴統一使用 `schema_`。

本專案資料庫不建立實體 `FOREIGN KEY`。下列關聯欄位僅為邏輯關聯，完整性由後端 API 交易檢核維護。

---

## 1. 資料表說明

* **表名稱**：`dms_log`
* **schema 檔名**：`schema_dms_log.md`、`schema_dms_log.html`
* **用途**：保存登入、文件調閱、調閱拒絕、文件下載、文件生命週期、資料夾異動、權限異動與 PDF 正式原檔下載拒絕等全域稽核紀錄。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `dl_id` | SERIAL (INT) | Primary Key | 稽核紀錄唯一識別碼。 |
| `dl_event_at` | TIMESTAMP | Not Null, Default | 事件發生時間，預設為 `CURRENT_TIMESTAMP`。 |
| `dl_actor_uid` | VARCHAR(50) | Nullable | 操作者帳號；未登入或登入失敗時可依情境留空或記錄輸入帳號。 |
| `dl_actor_name` | VARCHAR(255) | Nullable | 操作者姓名。 |
| `dl_actor_role` | VARCHAR(20) | Nullable | 操作者登入角色，僅記錄 `ADMIN` 或 `USER`。資料夾管理員屬於計算型管理身分，不寫入為登入角色。 |
| `dl_action` | VARCHAR(80) | Not Null | 動作代碼，例如 `DOCUMENT_PREVIEWED`、`DOCUMENT_PREVIEW_DENIED`、`DOCUMENT_DOWNLOADED`、`DOCUMENT_VERSION_CANCELLED`。 |
| `dl_resource_type` | VARCHAR(30) | Nullable | 被操作的資源類型，例如 `AUTH`、`FOLDER`、`DOCUMENT`、`VERSION`、`ACL`。 |
| `dl_resource_id` | VARCHAR(80) | Nullable | 被操作資源的主要識別碼。 |
| `dl_managed_df_fid` | INTEGER | Nullable | 事件所屬管理資料夾節點識別碼，便於依權限範圍查詢。 |
| `df_fid` | INTEGER | Nullable | 事件所屬資料夾識別碼，邏輯對應 `dms_folders.df_fid`；根目錄文件可使用 `0`。 |
| `dd_id` | INTEGER | Nullable | 事件所屬文件主檔識別碼，邏輯對應 `dms_doc.dd_id`。 |
| `ddv_id` | INTEGER | Nullable | 事件所屬文件版本識別碼，邏輯對應 `dms_doc_ver.ddv_id`。 |
| `dl_result` | VARCHAR(20) | Not Null | 執行結果。`SUCCESS`：成功，`FAILED`：失敗，`DENIED`：拒絕。 |
| `dl_ip_address` | VARCHAR(80) | Nullable | 事件來源 IP 位址。 |
| `dl_user_agent` | TEXT | Nullable | 瀏覽器或用戶端識別資訊。 |
| `dl_request_id` | VARCHAR(80) | Nullable | 後端請求追蹤識別碼，便於除錯與串接日誌。 |
| `dl_reason` | TEXT | Nullable | 使用者填寫或系統產生的原因，例如撤回原因、廢止原因或拒絕原因。 |
| `dl_before_data` | JSONB | Nullable | 異動前資料快照。 |
| `dl_after_data` | JSONB | Nullable | 異動後資料快照。 |
| `dl_metadata` | JSONB | Nullable | 額外資料及 `audit_context` 事件快照；快照保存資源位置、操作標的類型、名稱及文件版本。 |

---

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE dms_log (
    dl_id SERIAL PRIMARY KEY,
    dl_event_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dl_actor_uid VARCHAR(50),
    dl_actor_name VARCHAR(255),
    dl_actor_role VARCHAR(20),
    dl_action VARCHAR(80) NOT NULL,
    dl_resource_type VARCHAR(30),
    dl_resource_id VARCHAR(80),
    dl_managed_df_fid INTEGER,
    df_fid INTEGER,
    dd_id INTEGER,
    ddv_id INTEGER,
    dl_result VARCHAR(20) NOT NULL,
    dl_ip_address VARCHAR(80),
    dl_user_agent TEXT,
    dl_request_id VARCHAR(80),
    dl_reason TEXT,
    dl_before_data JSONB,
    dl_after_data JSONB,
    dl_metadata JSONB
);

CREATE INDEX idx_dms_log_event_at
ON dms_log(dl_event_at);

CREATE INDEX idx_dms_log_actor
ON dms_log(dl_actor_uid, dl_event_at);

CREATE INDEX idx_dms_log_action
ON dms_log(dl_action, dl_event_at);

CREATE INDEX idx_dms_log_result
ON dms_log(dl_result, dl_event_at);

CREATE INDEX idx_dms_log_folder
ON dms_log(df_fid, dl_event_at);

CREATE INDEX idx_dms_log_document
ON dms_log(dd_id, dl_event_at);

CREATE INDEX idx_dms_log_version
ON dms_log(ddv_id, dl_event_at);

CREATE INDEX idx_dms_log_managed_folder
ON dms_log(dl_managed_df_fid, dl_event_at);
```

---

## 3. 欄位與資料表註解

```sql
COMMENT ON TABLE dms_log IS '系統稽核紀錄';
COMMENT ON COLUMN dms_log.dl_id IS '稽核紀錄唯一識別碼';
COMMENT ON COLUMN dms_log.dl_event_at IS '事件發生時間';
COMMENT ON COLUMN dms_log.dl_actor_uid IS '操作者帳號';
COMMENT ON COLUMN dms_log.dl_actor_name IS '操作者姓名';
COMMENT ON COLUMN dms_log.dl_actor_role IS '操作者登入角色。ADMIN：系統管理員，USER：一般使用者';
COMMENT ON COLUMN dms_log.dl_action IS '動作代碼';
COMMENT ON COLUMN dms_log.dl_resource_type IS '被操作的資源類型';
COMMENT ON COLUMN dms_log.dl_resource_id IS '被操作資源的主要識別碼';
COMMENT ON COLUMN dms_log.dl_managed_df_fid IS '事件所屬管理資料夾節點識別碼';
COMMENT ON COLUMN dms_log.df_fid IS '事件所屬資料夾識別碼';
COMMENT ON COLUMN dms_log.dd_id IS '事件所屬文件主檔識別碼';
COMMENT ON COLUMN dms_log.ddv_id IS '事件所屬文件版本識別碼';
COMMENT ON COLUMN dms_log.dl_result IS '執行結果。SUCCESS：成功，FAILED：失敗，DENIED：拒絕';
COMMENT ON COLUMN dms_log.dl_ip_address IS '使用者來源 IP 位址';
COMMENT ON COLUMN dms_log.dl_user_agent IS '瀏覽器或用戶端識別資訊';
COMMENT ON COLUMN dms_log.dl_request_id IS '後端請求追蹤識別碼';
COMMENT ON COLUMN dms_log.dl_reason IS '使用者填寫或系統產生的原因';
COMMENT ON COLUMN dms_log.dl_before_data IS '異動前資料快照';
COMMENT ON COLUMN dms_log.dl_after_data IS '異動後資料快照';
COMMENT ON COLUMN dms_log.dl_metadata IS '額外資料';
```

---

## 4. 常用查詢方向

依時間區間查詢稽核紀錄：

```sql
SELECT dl_id,
       dl_event_at,
       dl_actor_uid,
       dl_actor_name,
       dl_actor_role,
       dl_action,
       dl_resource_type,
       dl_resource_id,
       dl_result,
       dl_ip_address,
       dl_reason,
       dl_metadata
  FROM dms_log
 WHERE dl_event_at >= :date_from
   AND dl_event_at < :date_to
 ORDER BY dl_event_at DESC,
          dl_id DESC;
```

查詢單一文件的預覽、下載與生命週期紀錄：

```sql
SELECT dl_id,
       dl_event_at,
       dl_actor_uid,
       dl_action,
       dl_result,
       ddv_id,
       dl_ip_address,
       dl_reason,
       dl_metadata
  FROM dms_log
 WHERE dd_id = :dd_id
 ORDER BY dl_event_at DESC,
          dl_id DESC;
```

查詢特定使用者的操作軌跡：

```sql
SELECT dl_id,
       dl_event_at,
       dl_action,
       dl_resource_type,
       dl_resource_id,
       dl_result,
       df_fid,
       dd_id,
       ddv_id,
       dl_ip_address
  FROM dms_log
 WHERE dl_actor_uid = :actor_uid
   AND dl_event_at >= :date_from
   AND dl_event_at < :date_to
 ORDER BY dl_event_at DESC,
          dl_id DESC;
```

---

## 5. 後端檢核規則

* 稽核紀錄採追加寫入模式，系統一般功能不提供修改或刪除稽核紀錄的操作。
* 稽核紀錄必須由後端統一寫入，不得只依賴前端事件紀錄。
* 管理類異動成功時，主要資料異動與稽核紀錄應在同一個短交易中完成；若稽核紀錄寫入失敗，該管理異動應回復。
* 查閱、預覽與下載屬高頻事件，仍須留下紀錄。
* `dl_actor_role` 只保存登入角色 `ADMIN` 或 `USER`。資料夾管理員不是登入角色，其管理範圍需由 `dl_managed_df_fid` 與後端權限計算判斷。
* `dl_result` 必須使用 `SUCCESS`、`FAILED` 或 `DENIED`。
* `dl_before_data`、`dl_after_data` 與 `dl_metadata` 必須保存合法 JSONB 資料；無額外資料時可使用 `{}`。
* `dl_metadata.audit_context` 必須保存事件發生當下的 `resource_location`、`target_type`、`target_name` 與 `target_version`，避免後續更名造成歷史紀錄失真。
* 所有由 HTTP API 觸發的事件應寫入 `dl_ip_address`、`dl_user_agent` 與 `dl_request_id`；登入失敗可保存嘗試登入的帳號，但不得保存密碼。
* 一般 API 僅允許查詢稽核紀錄，不提供更新或刪除稽核紀錄的端點。
* 系統管理介面新增 `SYSTEM_ADMIN_ASSIGNED`、`SYSTEM_ADMIN_REVOKED`、`AUDIT_LOG_EXPORTED`、`FOLDER_RESTORED` 與 `FOLDER_PURGED` 事件。
* 稽核查詢與 CSV 匯出僅讀取 `dms_log`；CSV 單次最多 50,000 筆。
