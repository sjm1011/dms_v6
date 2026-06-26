# 資料表結構：dms_ver_rev (版本修訂對照表)

本文件紀錄 DMS V5 之 `dms_ver_rev` 資料表結構定義。

本文件依據 `system_specifications.md` 第 1.5 節「資料表與欄位命名規則」製作。資料表名稱與 schema 檔名一致，檔名前綴統一使用 `schema_`。

本專案資料庫不建立實體 `FOREIGN KEY` 與實體 `CONSTRAINT`。下列關聯欄位僅為邏輯關聯，完整性由後端 API 交易檢核維護。

---

## 1. 資料表說明

* **表名稱**：`dms_ver_rev`
* **schema 檔名**：`schema_dms_ver_rev.md`、`schema_dms_ver_rev.html`
* **用途**：保存文件版本之修訂前後對照表檔案，以及本次版本對照的比較基準版本。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `dvr_id` | SERIAL (INT) | Primary Key | 修訂對照表唯一識別碼。 |
| `ddv_id` | INTEGER | Not Null | 本次文件版本 ID，邏輯對應 `dms_doc_ver.ddv_id`。 |
| `dvr_base_ddv_id` | INTEGER | Nullable | 比較基準版本 ID，邏輯對應 `dms_doc_ver.ddv_id`。第一版無比較基準時可空白。 |
| `dfi_id` | INTEGER | Not Null | 修訂對照表檔案 ID，邏輯對應 `dms_file.dfi_id`。 |
| `dvr_note` | TEXT | Nullable | 備註。 |
| `dvr_dc` | VARCHAR(1) | Not Null | 作廢註記，Y：作廢，N：有效。 |
| `dvr_crtby` | VARCHAR(50) | Not Null | 建立者帳號。 |
| `dvr_crtat` | TIMESTAMP | Not Null, Default | 建立時間，預設為 `CURRENT_TIMESTAMP`。 |
| `dvr_dcby` | VARCHAR(50) | Nullable | 作廢者帳號。 |
| `dvr_dcat` | TIMESTAMP | Nullable | 作廢時間。 |

---

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE dms_ver_rev (
    dvr_id SERIAL PRIMARY KEY,
    ddv_id INTEGER NOT NULL,
    dvr_base_ddv_id INTEGER,
    dfi_id INTEGER NOT NULL,
    dvr_note TEXT,
    dvr_dc VARCHAR(1) NOT NULL DEFAULT 'N',
    dvr_crtby VARCHAR(50) NOT NULL,
    dvr_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dvr_dcby VARCHAR(50),
    dvr_dcat TIMESTAMP
);

CREATE UNIQUE INDEX uq_dms_ver_rev_current
ON dms_ver_rev(ddv_id)
WHERE dvr_dc = 'N';

CREATE INDEX idx_dms_ver_rev_file
ON dms_ver_rev(dfi_id);
```

---

## 3. 欄位與資料表註解

```sql
COMMENT ON TABLE dms_ver_rev IS '版本修訂對照表';
COMMENT ON COLUMN dms_ver_rev.dvr_id IS '修訂對照表唯一識別碼';
COMMENT ON COLUMN dms_ver_rev.ddv_id IS '本次文件版本 ID';
COMMENT ON COLUMN dms_ver_rev.dvr_base_ddv_id IS '比較基準版本 ID';
COMMENT ON COLUMN dms_ver_rev.dfi_id IS '修訂對照表檔案 ID';
COMMENT ON COLUMN dms_ver_rev.dvr_note IS '備註';
COMMENT ON COLUMN dms_ver_rev.dvr_dc IS '作廢註記，Y：作廢，N：有效';
COMMENT ON COLUMN dms_ver_rev.dvr_crtby IS '建立者帳號';
COMMENT ON COLUMN dms_ver_rev.dvr_crtat IS '建立時間';
COMMENT ON COLUMN dms_ver_rev.dvr_dcby IS '作廢者帳號';
COMMENT ON COLUMN dms_ver_rev.dvr_dcat IS '作廢時間';
```

---

## 4. 常用查詢方向

查詢特定版本對應的有效修訂對照表檔案資訊：

```sql
SELECT r.dvr_id,
       r.ddv_id,
       r.dvr_base_ddv_id,
       r.dfi_id,
       f.dfi_name,
       f.dfi_path,
       f.dfi_size
  FROM dms_ver_rev r
  JOIN dms_file f ON f.dfi_id = r.dfi_id
 WHERE r.ddv_id = :version_id
   AND r.dvr_dc = 'N'
   AND f.dfi_status = 1;
```

---

## 5. 後端檢核規則

* 修訂對照表可後補或更新。
* `ddv_id` 必須存在於 `dms_doc_ver.ddv_id`。
* 每一版本同一時間只保留 1 筆未作廢的修訂對照表。
* `dfi_id` 必須存在於 `dms_file.dfi_id`，並符合 `dfi_role = 3`。
* `dvr_base_ddv_id` 若有值，必須存在於 `dms_doc_ver.ddv_id`；應為本次版本的比較基準版本。第一版無比較基準時可空白。
* 系統一般功能不提供物理刪除（DELETE）對照表紀錄，異動一律以作廢（dvr_dc = 'Y'）處理。
