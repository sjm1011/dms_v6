# 資料表結構：dms_audit_log (系統稽核紀錄)

本文件紀錄 DMS V5 之 `dms_audit_log` 資料表結構定義。

本文件依據 `system_specifications.md` 第 1.5 節「資料表與欄位命名規則」與第 5 節「全域稽核紀錄規格」製作。資料表名稱與 schema 檔名一致，檔名前綴統一使用 `schema_`。

本專案資料庫不建立實體 `FOREIGN KEY`。下列關聯欄位僅為邏輯關聯，完整性由後端 API 交易檢核維護。

---

## 1. 資料表說明

* **表名稱**：`dms_audit_log`
* **schema 檔名**：`schema_dms_audit_log.md`、`schema_dms_audit_log.html`
* **用途**：保存登入、登出、文件查閱、文件下載、文件生命週期、資料夾異動、權限異動、權限不足與操作失敗等全域稽核紀錄。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL (INT) | Primary Key | 稽核紀錄唯一識別碼。 |
| `event_at` | TIMESTAMP | Not Null, Default | 事件發生時間，預設為 `CURRENT_TIMESTAMP`。 |
| `actor_uid` | VARCHAR(50) | Nullable | 操作者帳號；未登入或登入失敗時可依情境留空或記錄輸入帳號。 |
| `actor_name` | VARCHAR(255) | Nullable | 操作者姓名。 |
| `actor_role` | VARCHAR(20) | Nullable | 操作者登入角色，僅記錄 `ADMIN` 或 `USER`。資料夾管理員屬於計算型管理身分，不寫入為登入角色。 |
| `action` | VARCHAR(80) | Not Null | 動作代碼，例如 `DOCUMENT_PREVIEWED`、`DOCUMENT_DOWNLOADED`、`DOCUMENT_VERSION_CANCELLED`。 |
| `resource_type` | VARCHAR(30) | Nullable | 被操作的資源類型，例如 `AUTH`、`FOLDER`、`DOCUMENT`、`VERSION`、`ACL`。 |
| `resource_id` | VARCHAR(80) | Nullable | 被操作資源的主要識別碼。 |
| `managed_folder_id` | INTEGER | Nullable | 事件所屬管理資料夾節點識別碼，便於依權限範圍查詢。 |
| `folder_id` | INTEGER | Nullable | 事件所屬資料夾識別碼，邏輯對應 `dms_folders.df_fid`；根目錄文件可使用 `0`。 |
| `document_id` | INTEGER | Nullable | 事件所屬文件主檔識別碼，邏輯對應 `dms_doc.dd_id`。 |
| `version_id` | INTEGER | Nullable | 事件所屬文件版本識別碼，邏輯對應 `dms_doc_ver.ddv_id`。 |
| `result` | VARCHAR(20) | Not Null | 執行結果。`SUCCESS`：成功，`FAILED`：失敗，`DENIED`：拒絕。 |
| `ip_address` | VARCHAR(80) | Nullable | 使用者來源 IP 位址。 |
| `user_agent` | TEXT | Nullable | 瀏覽器或用戶端識別資訊。 |
| `request_id` | VARCHAR(80) | Nullable | 後端請求追蹤識別碼，便於除錯與串接日誌。 |
| `reason` | TEXT | Nullable | 使用者填寫或系統產生的原因，例如撤回原因、廢止原因或拒絕原因。 |
| `before_data` | JSONB | Nullable | 異動前資料快照。 |
| `after_data` | JSONB | Nullable | 異動後資料快照。 |
| `metadata` | JSONB | Nullable | 額外資料，例如檔名、MIME Type、版本號、下載類型、浮水印內容或錯誤訊息。 |

---

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE dms_audit_log (
    id SERIAL PRIMARY KEY,
    event_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_uid VARCHAR(50),
    actor_name VARCHAR(255),
    actor_role VARCHAR(20),
    action VARCHAR(80) NOT NULL,
    resource_type VARCHAR(30),
    resource_id VARCHAR(80),
    managed_folder_id INTEGER,
    folder_id INTEGER,
    document_id INTEGER,
    version_id INTEGER,
    result VARCHAR(20) NOT NULL,
    ip_address VARCHAR(80),
    user_agent TEXT,
    request_id VARCHAR(80),
    reason TEXT,
    before_data JSONB,
    after_data JSONB,
    metadata JSONB
);

CREATE INDEX idx_dms_audit_log_event_at
ON dms_audit_log(event_at);

CREATE INDEX idx_dms_audit_log_actor
ON dms_audit_log(actor_uid, event_at);

CREATE INDEX idx_dms_audit_log_action
ON dms_audit_log(action, event_at);

CREATE INDEX idx_dms_audit_log_result
ON dms_audit_log(result, event_at);

CREATE INDEX idx_dms_audit_log_folder
ON dms_audit_log(folder_id, event_at);

CREATE INDEX idx_dms_audit_log_document
ON dms_audit_log(document_id, event_at);

CREATE INDEX idx_dms_audit_log_version
ON dms_audit_log(version_id, event_at);

CREATE INDEX idx_dms_audit_log_managed_folder
ON dms_audit_log(managed_folder_id, event_at);
```

---

## 3. 欄位與資料表註解

```sql
COMMENT ON TABLE dms_audit_log IS '系統稽核紀錄';
COMMENT ON COLUMN dms_audit_log.id IS '稽核紀錄唯一識別碼';
COMMENT ON COLUMN dms_audit_log.event_at IS '事件發生時間';
COMMENT ON COLUMN dms_audit_log.actor_uid IS '操作者帳號';
COMMENT ON COLUMN dms_audit_log.actor_name IS '操作者姓名';
COMMENT ON COLUMN dms_audit_log.actor_role IS '操作者登入角色。ADMIN：系統管理員，USER：一般使用者';
COMMENT ON COLUMN dms_audit_log.action IS '動作代碼';
COMMENT ON COLUMN dms_audit_log.resource_type IS '被操作的資源類型';
COMMENT ON COLUMN dms_audit_log.resource_id IS '被操作資源的主要識別碼';
COMMENT ON COLUMN dms_audit_log.managed_folder_id IS '事件所屬管理資料夾節點識別碼';
COMMENT ON COLUMN dms_audit_log.folder_id IS '事件所屬資料夾識別碼';
COMMENT ON COLUMN dms_audit_log.document_id IS '事件所屬文件主檔識別碼';
COMMENT ON COLUMN dms_audit_log.version_id IS '事件所屬文件版本識別碼';
COMMENT ON COLUMN dms_audit_log.result IS '執行結果。SUCCESS：成功，FAILED：失敗，DENIED：拒絕';
COMMENT ON COLUMN dms_audit_log.ip_address IS '使用者來源 IP 位址';
COMMENT ON COLUMN dms_audit_log.user_agent IS '瀏覽器或用戶端識別資訊';
COMMENT ON COLUMN dms_audit_log.request_id IS '後端請求追蹤識別碼';
COMMENT ON COLUMN dms_audit_log.reason IS '使用者填寫或系統產生的原因';
COMMENT ON COLUMN dms_audit_log.before_data IS '異動前資料快照';
COMMENT ON COLUMN dms_audit_log.after_data IS '異動後資料快照';
COMMENT ON COLUMN dms_audit_log.metadata IS '額外資料';
```

---

## 4. 常用查詢方向

依時間區間查詢稽核紀錄：

```sql
SELECT id,
       event_at,
       actor_uid,
       actor_name,
       actor_role,
       action,
       resource_type,
       resource_id,
       result,
       ip_address,
       reason,
       metadata
  FROM dms_audit_log
 WHERE event_at >= :date_from
   AND event_at < :date_to
 ORDER BY event_at DESC,
          id DESC;
```

查詢單一文件的預覽、下載與生命週期紀錄：

```sql
SELECT id,
       event_at,
       actor_uid,
       action,
       result,
       version_id,
       ip_address,
       reason,
       metadata
  FROM dms_audit_log
 WHERE document_id = :document_id
 ORDER BY event_at DESC,
          id DESC;
```

查詢特定使用者的操作軌跡：

```sql
SELECT id,
       event_at,
       action,
       resource_type,
       resource_id,
       result,
       folder_id,
       document_id,
       version_id,
       ip_address
  FROM dms_audit_log
 WHERE actor_uid = :actor_uid
   AND event_at >= :date_from
   AND event_at < :date_to
 ORDER BY event_at DESC,
          id DESC;
```

---

## 5. 後端檢核規則

* 稽核紀錄採追加寫入模式，系統一般功能不提供修改或刪除稽核紀錄的操作。
* 稽核紀錄必須由後端統一寫入，不得只依賴前端事件紀錄。
* 管理類異動成功時，主要資料異動與稽核紀錄應在同一個短交易中完成；若稽核紀錄寫入失敗，該管理異動應回復。
* 查閱、預覽與下載屬高頻事件，仍須留下紀錄。
* `actor_role` 只保存登入角色 `ADMIN` 或 `USER`。資料夾管理員不是登入角色，其管理範圍需由 `managed_folder_id` 與後端權限計算判斷。
* `result` 必須使用 `SUCCESS`、`FAILED` 或 `DENIED`。
* `before_data`、`after_data` 與 `metadata` 必須保存合法 JSONB 資料；無額外資料時可使用 `{}`。
* 一般 API 僅允許查詢稽核紀錄，不提供更新或刪除稽核紀錄的端點。
