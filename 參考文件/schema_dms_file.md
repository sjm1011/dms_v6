# 資料表結構：dms_file (檔案後設資料)

本文件紀錄 DMS V4 之 `dms_file` 資料表結構定義。

本文件依據 `system_specifications.md` 第 1.5 節「資料表與欄位命名規則」製作。資料表名稱與 schema 檔名一致，檔名前綴統一使用 `schema_`。

本專案資料庫不建立實體 `FOREIGN KEY`。其他資料表對 `dms_file` 的引用皆屬邏輯關聯，完整性由後端 API 交易檢核維護。

---

## 1. 資料表說明

* **表名稱**：`dms_file`
* **schema 檔名**：`schema_dms_file.md`、`schema_dms_file.html`
* **用途**：集中保存正式發布檔案、PDF 原始編修檔案、修訂對照表與廢止公文的檔案後設資料。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `dfi_id` | SERIAL (INT) | Primary Key | 檔案唯一識別碼。 |
| `dfi_role` | SMALLINT | Not Null | 檔案角色。1：正式發布檔案，2：PDF 原始編修檔案，3：修訂對照表，4：廢止公文。 |
| `dfi_name` | VARCHAR(255) | Not Null | 原始檔名。 |
| `dfi_path` | VARCHAR(1000) | Not Null | 實體儲存路徑。 |
| `dfi_ext` | VARCHAR(20) | Not Null | 副檔名，建議以小寫保存。 |
| `dfi_mime` | VARCHAR(255) | Not Null | MIME Type。 |
| `dfi_size` | BIGINT | Not Null | 檔案大小，單位為 bytes。 |
| `dfi_sha256` | CHAR(64) | Not Null | 檔案 SHA-256 雜湊值。 |
| `dfi_status` | SMALLINT | Not Null | 檔案狀態。0：作廢，1：有效，2：已取代。 |
| `dfi_crtby` | VARCHAR(50) | Not Null | 上傳者帳號。 |
| `dfi_crtat` | TIMESTAMP | Not Null, Default | 上傳時間，預設為 `CURRENT_TIMESTAMP`。 |

---

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE dms_file (
    dfi_id SERIAL PRIMARY KEY,
    dfi_role SMALLINT NOT NULL,
    dfi_name VARCHAR(255) NOT NULL,
    dfi_path VARCHAR(1000) NOT NULL,
    dfi_ext VARCHAR(20) NOT NULL,
    dfi_mime VARCHAR(255) NOT NULL,
    dfi_size BIGINT NOT NULL DEFAULT 0,
    dfi_sha256 CHAR(64) NOT NULL,
    dfi_status SMALLINT NOT NULL DEFAULT 1,
    dfi_crtby VARCHAR(50) NOT NULL,
    dfi_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_dms_file_path
ON dms_file(dfi_path);

CREATE INDEX idx_dms_file_sha256
ON dms_file(dfi_sha256);

CREATE INDEX idx_dms_file_role
ON dms_file(dfi_role, dfi_status);
```

---

## 3. 欄位與資料表註解

```sql
COMMENT ON TABLE dms_file IS '檔案後設資料';
COMMENT ON COLUMN dms_file.dfi_id IS '檔案唯一識別碼';
COMMENT ON COLUMN dms_file.dfi_role IS '檔案角色。1：正式發布檔案，2：PDF 原始編修檔案，3：修訂對照表，4：廢止公文';
COMMENT ON COLUMN dms_file.dfi_name IS '原始檔名';
COMMENT ON COLUMN dms_file.dfi_path IS '實體儲存路徑';
COMMENT ON COLUMN dms_file.dfi_ext IS '副檔名';
COMMENT ON COLUMN dms_file.dfi_mime IS 'MIME Type';
COMMENT ON COLUMN dms_file.dfi_size IS '檔案大小，單位為 bytes';
COMMENT ON COLUMN dms_file.dfi_sha256 IS '檔案 SHA-256 雜湊值';
COMMENT ON COLUMN dms_file.dfi_status IS '檔案狀態。0：作廢，1：有效，2：已取代';
COMMENT ON COLUMN dms_file.dfi_crtby IS '上傳者帳號';
COMMENT ON COLUMN dms_file.dfi_crtat IS '上傳時間';
```

---

## 4. 後端檢核規則

* 上傳檔案時，副檔名與 MIME Type 必須同時符合第 4.5 節白名單。
* `dfi_role = 1` 用於正式發布檔案。
* `dfi_role = 2` 用於 PDF 原始編修檔案。
* `dfi_role = 3` 用於修訂對照表檔案。
* `dfi_role = 4` 用於廢止公文檔案。
