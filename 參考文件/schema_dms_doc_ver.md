# 資料表結構：dms_doc_ver (文件版本)

本文件紀錄 DMS V5 之 `dms_doc_ver` 資料表結構定義。

本文件依據 `system_specifications.md` 第 1.5 節「資料表與欄位命名規則」製作。資料表名稱與 schema 檔名一致，檔名前綴統一使用 `schema_`。

本專案資料庫不建立實體 `FOREIGN KEY` 與實體 `CONSTRAINT`。下列關聯欄位僅為邏輯關聯，完整性由後端 API 交易檢核維護。

---

## 1. 資料表說明

* **表名稱**：`dms_doc_ver`
* **schema 檔名**：`schema_dms_doc_ver.md`、`schema_dms_doc_ver.html`
* **用途**：保存文件每一次正式發布版本的版本號、修訂日期、生效期間、正式發布檔案、PDF 原始編修檔案與撤回紀錄。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `ddv_id` | SERIAL (INT) | Primary Key | 文件版本唯一識別碼。 |
| `dd_id` | INTEGER | Not Null | 文件主檔 ID，邏輯對應 `dms_doc.dd_id`。 |
| `ddv_seq` | INTEGER | Not Null | 系統版次流水號，用於排序。 |
| `ddv_no` | VARCHAR(50) | Nullable | 使用者輸入版本號，可空白。 |
| `ddv_rev_date` | DATE | Not Null | 修訂日期。 |
| `ddv_eff_at` | TIMESTAMP | Not Null | 生效時間。 |
| `ddv_eff_to` | TIMESTAMP | Nullable | 結束時間，由系統於新版建立時寫入。 |
| `ddv_chg_note` | TEXT | Not Null | 異動說明。 |
| `ddv_pub_dfi_id` | INTEGER | Not Null | 正式發布檔案 ID，邏輯對應 `dms_file.dfi_id`。 |
| `ddv_src_dfi_id` | INTEGER | Nullable | PDF 原始編修檔案 ID，邏輯對應 `dms_file.dfi_id`。 |
| `ddv_cancel_at` | TIMESTAMP | Nullable | 撤回時間。 |
| `ddv_cancel_by` | VARCHAR(50) | Nullable | 撤回人員帳號。 |
| `ddv_cancel_reason` | TEXT | Nullable | 撤回原因。 |
| `ddv_crtby` | VARCHAR(50) | Not Null | 建立者帳號。 |
| `ddv_crtat` | TIMESTAMP | Not Null, Default | 建立時間，預設為 `CURRENT_TIMESTAMP`。 |
| `ddv_updby` | VARCHAR(50) | Nullable | 最後異動者帳號。 |
| `ddv_updat` | TIMESTAMP | Nullable | 最後異動時間。 |

---

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE dms_doc_ver (
    ddv_id SERIAL PRIMARY KEY,
    dd_id INTEGER NOT NULL,
    ddv_seq INTEGER NOT NULL,
    ddv_no VARCHAR(50),
    ddv_rev_date DATE NOT NULL,
    ddv_eff_at TIMESTAMP NOT NULL,
    ddv_eff_to TIMESTAMP,
    ddv_chg_note TEXT NOT NULL,
    ddv_pub_dfi_id INTEGER NOT NULL,
    ddv_src_dfi_id INTEGER,
    ddv_cancel_at TIMESTAMP,
    ddv_cancel_by VARCHAR(50),
    ddv_cancel_reason TEXT,
    ddv_crtby VARCHAR(50) NOT NULL,
    ddv_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ddv_updby VARCHAR(50),
    ddv_updat TIMESTAMP
);

CREATE UNIQUE INDEX uq_dms_doc_ver_seq
ON dms_doc_ver(dd_id, ddv_seq);

CREATE UNIQUE INDEX uq_dms_doc_ver_no
ON dms_doc_ver(dd_id, ddv_no)
WHERE ddv_no IS NOT NULL;

CREATE INDEX idx_dms_doc_ver_doc
ON dms_doc_ver(dd_id);

CREATE INDEX idx_dms_doc_ver_eff_lookup
ON dms_doc_ver(dd_id, ddv_eff_at, ddv_eff_to)
WHERE ddv_cancel_at IS NULL;

CREATE INDEX idx_dms_doc_ver_cancel
ON dms_doc_ver(ddv_cancel_at)
WHERE ddv_cancel_at IS NOT NULL;
```

---

## 3. 欄位與資料表註解

```sql
COMMENT ON TABLE dms_doc_ver IS '文件版本';
COMMENT ON COLUMN dms_doc_ver.ddv_id IS '文件版本唯一識別碼';
COMMENT ON COLUMN dms_doc_ver.dd_id IS '文件主檔 ID';
COMMENT ON COLUMN dms_doc_ver.ddv_seq IS '系統版次流水號';
COMMENT ON COLUMN dms_doc_ver.ddv_no IS '使用者輸入版本號';
COMMENT ON COLUMN dms_doc_ver.ddv_rev_date IS '修訂日期';
COMMENT ON COLUMN dms_doc_ver.ddv_eff_at IS '生效時間';
COMMENT ON COLUMN dms_doc_ver.ddv_eff_to IS '結束時間';
COMMENT ON COLUMN dms_doc_ver.ddv_chg_note IS '異動說明';
COMMENT ON COLUMN dms_doc_ver.ddv_pub_dfi_id IS '正式發布檔案 ID';
COMMENT ON COLUMN dms_doc_ver.ddv_src_dfi_id IS 'PDF 原始編修檔案 ID';
COMMENT ON COLUMN dms_doc_ver.ddv_cancel_at IS '撤回時間';
COMMENT ON COLUMN dms_doc_ver.ddv_cancel_by IS '撤回人員帳號';
COMMENT ON COLUMN dms_doc_ver.ddv_cancel_reason IS '撤回原因';
COMMENT ON COLUMN dms_doc_ver.ddv_crtby IS '建立者帳號';
COMMENT ON COLUMN dms_doc_ver.ddv_crtat IS '建立時間';
COMMENT ON COLUMN dms_doc_ver.ddv_updby IS '最後異動者帳號';
COMMENT ON COLUMN dms_doc_ver.ddv_updat IS '最後異動時間';
```

---

## 4. 常用查詢方向

一般使用者查詢目前有效版本時，後端需額外套用資料夾狀態、資料夾 ACL 與 PDF 下載限制。下列 SQL 只表示版本時間條件：

```sql
SELECT d.dd_id,
       d.df_fid,
       d.dd_code,
       d.dd_title,
       v.ddv_id,
       v.ddv_no,
       v.ddv_eff_at,
       v.ddv_eff_to,
       f.dfi_name,
       f.dfi_ext,
       f.dfi_mime,
       f.dfi_size
  FROM dms_doc d
  JOIN dms_doc_ver v ON v.dd_id = d.dd_id
  JOIN dms_file f ON f.dfi_id = v.ddv_pub_dfi_id
 WHERE d.dd_status = 1
   AND v.ddv_cancel_at IS NULL
   AND v.ddv_eff_at <= CURRENT_TIMESTAMP
   AND (v.ddv_eff_to IS NULL OR CURRENT_TIMESTAMP < v.ddv_eff_to);
```

---

## 5. 後端檢核規則

* 文件版本不設 `ddv_status` 欄位。版本狀態由 `ddv_eff_at`、`ddv_eff_to` 與 `ddv_cancel_at` 推導。
* `dd_id` 必須存在於有效的 `dms_doc.dd_id`。
* 上傳新版本時，同一 `dd_id` 不得存在未撤回且尚未生效的預約版本。
* 上傳新版本時，需於同一交易內更新前一個未撤回版本的 `ddv_eff_to`。
* 撤回最新版本時，需於同一交易內寫入被撤回版本的撤回欄位，並清空前一版本的 `ddv_eff_to`。
* `ddv_pub_dfi_id` 必須存在於 `dms_file.dfi_id`，並符合 `dfi_role = 1`。
* `ddv_src_dfi_id` 若有值，必須存在於 `dms_file.dfi_id`，並符合 `dfi_role = 2`，且僅 PDF 正式發布檔案可掛原始編修檔。
