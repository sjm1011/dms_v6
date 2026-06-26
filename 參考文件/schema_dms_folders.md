# 資料表結構：dms_folders (資料夾)

本文件紀錄文件管理系統 V4 (DMS V4) 之 dms_folders 資料表結構定義。

---

## 1. 資料表說明

*   **表名稱**：dms_folders
*   **用途**：儲存資料夾樹狀結構，並包含狀態、追蹤與封存紀錄。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `df_fid` | SERIAL (INT) | Primary Key | 資料夾唯一識別碼，自動遞增編號。 |
| `df_pid` | INTEGER | Nullable | 父資料夾 ID。若為根目錄則為 NULL。對應至此表的 `df_fid`。 |
| `df_root_fid` | INTEGER | Not Null | 根目錄的第一層資料夾 ID。若為第一層資料夾則等於 `df_fid`。用於 ACL 權限極速比對。 |
| `df_name` | VARCHAR(255) | Not Null | 資料夾名稱。 |
| `df_status` | SMALLINT | Not Null | 資料夾狀態。0: 已刪除(作廢), 1: 正常, 2: 封存。預設為 1。 |
| `df_access_type` | SMALLINT | Not Null | 資料夾存取狀態。1: 公開, 2: 限閱。預設為 2。 |
| `df_crtby` | VARCHAR(50) | Not Null | 建立者的使用者帳號。 |
| `df_crtat` | TIMESTAMP | Not Null, Default | 建立時間，預設為 `CURRENT_TIMESTAMP`。 |
| `df_updby` | VARCHAR(50) | Nullable | 最後執行異動操作的使用者帳號。 |
| `df_updat` | TIMESTAMP | Nullable | 最後異動時間。 |
| `df_arcby` | VARCHAR(50) | Nullable | 執行封存操作的管理員帳號。 |
| `df_arcat` | TIMESTAMP | Nullable | 執行封存操作的時間。 |

### PostgreSQL DDL 語法

```sql
CREATE TABLE dms_folders (
    df_fid SERIAL PRIMARY KEY,
    df_pid INTEGER,
    df_root_fid INTEGER NOT NULL,
    df_name VARCHAR(255) NOT NULL,
    df_status SMALLINT NOT NULL DEFAULT 1,
    df_access_type SMALLINT NOT NULL DEFAULT 2,
    df_crtby VARCHAR(50) NOT NULL,
    df_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    df_updby VARCHAR(50),
    df_updat TIMESTAMP,
    df_arcby VARCHAR(50),
    df_arcat TIMESTAMP
);

-- 建立索引以提升查詢效能
CREATE INDEX idx_dms_folders_pid ON dms_folders(df_pid);
CREATE INDEX idx_dms_folders_root ON dms_folders(df_root_fid);
CREATE INDEX idx_dms_folders_status ON dms_folders(df_status);
CREATE INDEX idx_dms_folders_access_type ON dms_folders(df_access_type);

-- 欄位與資料表註解
COMMENT ON TABLE dms_folders IS '資料夾';
COMMENT ON COLUMN dms_folders.df_fid IS '資料夾唯一識別碼，自動遞增編號';
COMMENT ON COLUMN dms_folders.df_pid IS '父資料夾 ID。若為根目錄則為 NULL。對應至 dms_folders(df_fid)';
COMMENT ON COLUMN dms_folders.df_root_fid IS '根目錄的第一層資料夾 ID。若為第一層資料夾則等於 df_fid。用於 ACL 權限極速比對';
COMMENT ON COLUMN dms_folders.df_name IS '資料夾名稱';
COMMENT ON COLUMN dms_folders.df_status IS '資料夾狀態。0: 已刪除(作廢), 1: 正常, 2: 封存';
COMMENT ON COLUMN dms_folders.df_access_type IS '資料夾存取狀態。1: 公開, 2: 限閱';
COMMENT ON COLUMN dms_folders.df_crtby IS '建立者的使用者帳號';
COMMENT ON COLUMN dms_folders.df_crtat IS '建立時間，預設為目前時間';
COMMENT ON COLUMN dms_folders.df_updby IS '最後執行異動操作的使用者帳號';
COMMENT ON COLUMN dms_folders.df_updat IS '最後異動時間';
COMMENT ON COLUMN dms_folders.df_arcby IS '執行封存操作的管理員帳號';
COMMENT ON COLUMN dms_folders.df_arcat IS '執行封存操作的時間';
```

### 既有資料庫升級語法

```sql
ALTER TABLE dms_folders
ADD COLUMN IF NOT EXISTS df_access_type SMALLINT NOT NULL DEFAULT 2;

CREATE INDEX IF NOT EXISTS idx_dms_folders_access_type
ON dms_folders(df_access_type);
```
