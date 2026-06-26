# 資料表結構：dms_folder_managers (資料夾管理員)

本文件紀錄文件管理系統 V4 (DMS V4) 之資料夾管理員關聯表結構定義。

---

## 1. 資料表說明

*   **表名稱**：dms_folder_managers
*   **用途**：紀錄任一資料夾節點被直接指派了哪些使用者作為資料夾管理員。
*   **關聯**：對應至 `dms_folders` 的任一資料夾節點。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `dfm_id` | SERIAL (INT) | Primary Key | 唯一識別碼，自動遞增。 |
| `df_fid` | INTEGER | Not Null | 關聯至 `dms_folders` 的資料夾 ID。 |
| `usr_uid` | VARCHAR(50) | Not Null | 被指派為管理員的使用者帳號。 |
| `dfm_crtby` | VARCHAR(50) | Not Null | 建立此設定的操作者帳號 (通常為系統管理員)。 |
| `dfm_crtat` | TIMESTAMP | Not Null, Default | 建立時間，預設為 `CURRENT_TIMESTAMP`。 |
| `dfm_dc` | VARCHAR(1) | Not Null, Default | 作廢註記 (Y/N)。預設為 'N'。 |
| `dfm_dcby` | VARCHAR(50) | Nullable | 執行作廢操作的操作者帳號。 |
| `dfm_dcat` | TIMESTAMP | Nullable | 作廢時間。 |

---

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE dms_folder_managers (
    dfm_id SERIAL PRIMARY KEY,
    df_fid INTEGER NOT NULL,
    usr_uid VARCHAR(50) NOT NULL,
    dfm_crtby VARCHAR(50) NOT NULL,
    dfm_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dfm_dc VARCHAR(1) NOT NULL DEFAULT 'N',
    dfm_dcby VARCHAR(50),
    dfm_dcat TIMESTAMP
);

-- 建立索引以提升查詢效能與確保唯一性 (僅計算未作廢者)
CREATE UNIQUE INDEX idx_dms_folder_mgr_uniq ON dms_folder_managers(df_fid, usr_uid) WHERE dfm_dc = 'N';
CREATE INDEX idx_dms_folder_mgr_uid ON dms_folder_managers(usr_uid);

-- 欄位與資料表註解
COMMENT ON TABLE dms_folder_managers IS '資料夾管理員';
COMMENT ON COLUMN dms_folder_managers.dfm_id IS '唯一識別碼，自動遞增';
COMMENT ON COLUMN dms_folder_managers.df_fid IS '關聯至 dms_folders 的資料夾 ID';
COMMENT ON COLUMN dms_folder_managers.usr_uid IS '被指派為管理員的使用者帳號';
COMMENT ON COLUMN dms_folder_managers.dfm_crtby IS '建立此設定的操作者帳號';
COMMENT ON COLUMN dms_folder_managers.dfm_crtat IS '建立時間，預設為目前時間';
COMMENT ON COLUMN dms_folder_managers.dfm_dc IS '作廢註記 (Y/N)';
COMMENT ON COLUMN dms_folder_managers.dfm_dcby IS '執行作廢操作的操作者帳號';
COMMENT ON COLUMN dms_folder_managers.dfm_dcat IS '作廢時間';
```
