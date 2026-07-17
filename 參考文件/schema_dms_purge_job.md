# 資料表結構：dms_purge_job（實體檔案清理工作）

本文件紀錄 DMS V6 之 `dms_purge_job` 資料表結構定義。此表用於協調 PostgreSQL 業務資料作廢與 Windows 實體檔案刪除，避免清理失敗後失去重試依據。

本專案資料庫不建立 Foreign Key 與額外命名 Constraint。資料完整性由後端 API 交易與檔案隔離流程維護。

## 1. 資料表說明

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `dpj_id` | SERIAL | Primary Key | 清理工作識別碼。 |
| `df_fid` | INTEGER | Not Null | 封存批次根資料夾 ID。 |
| `dpj_status` | VARCHAR(30) | Not Null | `PREPARING`、`CLEANUP_PENDING`、`COMPLETED` 或 `FAILED`。 |
| `dpj_manifest` | JSONB | Not Null | 原始檔案、隔離檔案與檔案後設資料 ID 清單。 |
| `dpj_requested_by` | VARCHAR(50) | Not Null | 執行永久刪除的系統管理員帳號。 |
| `dpj_requested_at` | TIMESTAMP | Not Null | 建立時間。 |
| `dpj_completed_at` | TIMESTAMP | Nullable | 清理完成時間。 |
| `dpj_retry_count` | INTEGER | Not Null | 清理重試次數。 |
| `dpj_error` | TEXT | Nullable | 最近一次失敗原因。 |

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE dms_purge_job (
    dpj_id SERIAL PRIMARY KEY,
    df_fid INTEGER NOT NULL,
    dpj_status VARCHAR(30) NOT NULL,
    dpj_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
    dpj_requested_by VARCHAR(50) NOT NULL,
    dpj_requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dpj_completed_at TIMESTAMP,
    dpj_retry_count INTEGER NOT NULL DEFAULT 0,
    dpj_error TEXT
);

CREATE INDEX idx_dms_purge_job_status
ON dms_purge_job(dpj_status, dpj_requested_at);

CREATE INDEX idx_dms_purge_job_folder
ON dms_purge_job(df_fid, dpj_requested_at);
```

## 3. 欄位與資料表註解

```sql
COMMENT ON TABLE dms_purge_job IS '封存資料夾實體檔案清理工作';
COMMENT ON COLUMN dms_purge_job.dpj_id IS '清理工作識別碼';
COMMENT ON COLUMN dms_purge_job.df_fid IS '封存批次根資料夾 ID';
COMMENT ON COLUMN dms_purge_job.dpj_status IS 'PREPARING、CLEANUP_PENDING、COMPLETED 或 FAILED';
COMMENT ON COLUMN dms_purge_job.dpj_manifest IS '原始與隔離檔案清單';
COMMENT ON COLUMN dms_purge_job.dpj_requested_by IS '執行永久刪除的管理員帳號';
COMMENT ON COLUMN dms_purge_job.dpj_requested_at IS '建立時間';
COMMENT ON COLUMN dms_purge_job.dpj_completed_at IS '清理完成時間';
COMMENT ON COLUMN dms_purge_job.dpj_retry_count IS '清理重試次數';
COMMENT ON COLUMN dms_purge_job.dpj_error IS '最近一次失敗原因';
```

## 4. 後端檢核規則

* 只有系統管理員可建立或重試清理工作。
* 永久刪除只允許封存滿 90 天的封存批次根資料夾。
* `dpj_manifest` 中的每個原始檔案必須位於 `DMS_STORAGE_ROOT` 或 `DMS_LEGACY_STORAGE_ROOT` 內。
* 資料庫交易提交前，檔案必須先移入相同儲存根目錄的 `.purge/<dpj_id>` 隔離區。
* 資料庫交易失敗時必須將已隔離檔案移回原路徑。
* 資料庫交易完成但隔離區刪除失敗時，工作維持 `CLEANUP_PENDING`，允許後續重試。
* `COMPLETED` 工作不得再次執行。
