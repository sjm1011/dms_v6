# 資料表結構：dms_doc (文件主檔)

本文件紀錄 DMS V5 之 `dms_doc` 資料表結構定義。

本文件依據 `system_specifications.md` 第 1.5 節「資料表與欄位命名規則」製作。資料表名稱與 schema 檔名一致，檔名前綴統一使用 `schema_`。

本專案資料庫不建立實體 `FOREIGN KEY` 與實體 `CONSTRAINT`。下列關聯欄位僅為邏輯關聯，完整性由後端 API 交易檢核維護。

---

## 1. 資料表說明

* **表名稱**：`dms_doc`
* **schema 檔名**：`schema_dms_doc.md`、`schema_dms_doc.html`
* **用途**：代表一份文件本身，保存文件編號、文件名稱、所屬資料夾、文件狀態與廢止資訊。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `dd_id` | SERIAL (INT) | Primary Key | 文件主檔唯一識別碼。 |
| `df_fid` | INTEGER | Not Null | 所屬資料夾 ID，邏輯對應 `dms_folders.df_fid`。 |
| `dd_parent_id` | INTEGER | Nullable | 主文件 ID，邏輯對應 `dms_doc.dd_id`；空白代表第一階文件。 |
| `dd_code` | VARCHAR(50) | Nullable | 文件編號，可留空。非空白時由前端轉為大寫。 |
| `dd_title` | VARCHAR(255) | Not Null | 文件名稱。 |
| `dd_status` | SMALLINT | Not Null | 文件狀態。1：有效，2：廢止。 |
| `dd_obs_at` | TIMESTAMP | Nullable | 廢止時間。 |
| `dd_obs_by` | VARCHAR(50) | Nullable | 廢止人員帳號。 |
| `dd_obs_reason` | TEXT | Nullable | 廢止原因。 |
| `dfi_id` | INTEGER | Nullable | 廢止公文檔案 ID，邏輯對應 `dms_file.dfi_id`。 |
| `dd_obs_src` | SMALLINT | Nullable | 廢止來源。1：手動廢止，2：資料夾封存自動廢止。 |
| `dd_crtby` | VARCHAR(50) | Not Null | 建立者帳號。 |
| `dd_crtat` | TIMESTAMP | Not Null, Default | 建立時間，預設為 `CURRENT_TIMESTAMP`。 |
| `dd_updby` | VARCHAR(50) | Nullable | 最後異動者帳號。 |
| `dd_updat` | TIMESTAMP | Nullable | 最後異動時間。 |

---

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE dms_doc (
    dd_id SERIAL PRIMARY KEY,
    df_fid INTEGER NOT NULL,
    dd_parent_id INTEGER,
    dd_code VARCHAR(50),
    dd_title VARCHAR(255) NOT NULL,
    dd_status SMALLINT NOT NULL DEFAULT 1,
    dd_obs_at TIMESTAMP,
    dd_obs_by VARCHAR(50),
    dd_obs_reason TEXT,
    dfi_id INTEGER,
    dd_obs_src SMALLINT,
    dd_crtby VARCHAR(50) NOT NULL,
    dd_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dd_updby VARCHAR(50),
    dd_updat TIMESTAMP
);

CREATE UNIQUE INDEX uq_dms_doc_code
ON dms_doc(dd_code)
WHERE dd_code IS NOT NULL;

CREATE INDEX idx_dms_doc_folder
ON dms_doc(df_fid, dd_status);

CREATE INDEX idx_dms_doc_parent
ON dms_doc(dd_parent_id);

CREATE INDEX idx_dms_doc_obs
ON dms_doc(dd_obs_at)
WHERE dd_status = 2;
```

### 既有資料庫升級語法

```sql
ALTER TABLE dms_doc
ALTER COLUMN dd_code DROP NOT NULL;

ALTER TABLE dms_doc
ADD COLUMN IF NOT EXISTS dd_parent_id INTEGER;

UPDATE dms_doc
   SET dd_code = NULLIF(UPPER(BTRIM(dd_code)), '');

DROP INDEX IF EXISTS uq_dms_doc_code;

CREATE UNIQUE INDEX uq_dms_doc_code
ON dms_doc(dd_code)
WHERE dd_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_doc_parent
ON dms_doc(dd_parent_id);
```

---

## 3. 欄位與資料表註解

```sql
COMMENT ON TABLE dms_doc IS '文件主檔';
COMMENT ON COLUMN dms_doc.dd_id IS '文件主檔唯一識別碼';
COMMENT ON COLUMN dms_doc.df_fid IS '所屬資料夾 ID';
COMMENT ON COLUMN dms_doc.dd_parent_id IS '主文件識別碼；空白代表第一階文件';
COMMENT ON COLUMN dms_doc.dd_code IS '文件編號';
COMMENT ON COLUMN dms_doc.dd_title IS '文件名稱';
COMMENT ON COLUMN dms_doc.dd_status IS '文件狀態。1：有效，2：廢止';
COMMENT ON COLUMN dms_doc.dd_obs_at IS '廢止時間';
COMMENT ON COLUMN dms_doc.dd_obs_by IS '廢止人員帳號';
COMMENT ON COLUMN dms_doc.dd_obs_reason IS '廢止原因';
COMMENT ON COLUMN dms_doc.dfi_id IS '廢止公文檔案 ID';
COMMENT ON COLUMN dms_doc.dd_obs_src IS '廢止來源。1：手動廢止，2：資料夾封存自動廢止';
COMMENT ON COLUMN dms_doc.dd_crtby IS '建立者帳號';
COMMENT ON COLUMN dms_doc.dd_crtat IS '建立時間';
COMMENT ON COLUMN dms_doc.dd_updby IS '最後異動者帳號';
COMMENT ON COLUMN dms_doc.dd_updat IS '最後異動時間';
```

---

## 4. 常用查詢方向

依資料夾查詢有效文件清單：

```sql
SELECT dd_id,
       df_fid,
       dd_parent_id,
       dd_code,
       dd_title,
       dd_crtby,
       dd_crtat
  FROM dms_doc
 WHERE df_fid = :folder_id
   AND dd_status = 1
 ORDER BY dd_code ASC;
```

依文件編號查詢文件主檔：

```sql
SELECT dd_id,
       df_fid,
       dd_parent_id,
       dd_code,
       dd_title,
       dd_status,
       dd_crtby,
       dd_crtat
  FROM dms_doc
 WHERE dd_code = :document_code;
```

---

## 5. 後端檢核規則

* 文件編號 `dd_code` 可為 `NULL`；前端留空時，後端必須儲存為 `NULL`，不得儲存空字串。
* 前端必須將文件編號去除前後空白並轉為大寫，再送至後端。
* 文件編號非空白時採全系統唯一。唯一索引直接使用 `dd_code`，不得在索引定義使用 `UPPER()`、型別轉換或其他函數。
* 未編號文件可補填文件編號；已編號文件亦可修改或清空，但修改後的非空白編號不得與其他文件重複。
* `df_fid` 必須存在於有效的 `dms_folders.df_fid`。
* `dd_parent_id` 若有值，必須指向同一資料夾內、有效且本身沒有 `dd_parent_id` 的第一階文件。
* 文件階層只允許「主文件 → 相關文件」2 層；相關文件不得再建立相關文件。
* 主文件廢止時，全部尚未廢止的相關文件必須使用相同原因與核准文件一併廢止。
* 有相關文件的主文件執行刪除時，主文件、全部相關文件及所有版本一併刪除；刪除前需逐份保留稽核紀錄。
* 文件主檔為 `dd_status = 2` 時，不得再建立新版、預約版或執行撤回版本。
* 手動廢止時，`dfi_id` 必填，且必須存在於 `dms_file.dfi_id`，並符合 `dfi_role = 4`。
* 資料夾封存造成文件廢止時，需於同一交易內更新資料夾樹與底下文件主檔。
