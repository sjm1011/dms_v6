# 資料表結構：dms_folder_acl (資料夾存取控制表)

本文件紀錄文件管理系統 V4 (DMS V4) 之資料夾存取控制表結構定義。

---

## 1. 資料表說明

*   **表名稱**：dms_folder_acl
*   **用途**：紀錄限閱資料夾授權給哪些部門或使用者。資料夾是否公開或限閱由 `dms_folders.df_access_type` 決定。
*   **授權類型**：可設定為特定群組、特定使用者。
*   **資安規則**：沒有 ACL 紀錄不代表公開。若 `df_access_type = 2` 且沒有任何有效 ACL 紀錄，一般使用者不可見。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `dfa_id` | SERIAL (INT) | Primary Key | 唯一識別碼，自動遞增。 |
| `df_fid` | INTEGER | Not Null | 關聯至 `dms_folders` 的資料夾 ID。 |
| `dfa_type` | SMALLINT | Not Null | 授權類型。1: 群組 (部門), 2: 特定使用者。 |
| `dfa_target` | VARCHAR(50) | Nullable | 授權目標對象。若 `type=1` 為群組 ID；若 `type=2` 為使用者帳號。 |
| `dfa_crtby` | VARCHAR(50) | Not Null | 建立此權限規則的資料夾管理員帳號。 |
| `dfa_crtat` | TIMESTAMP | Not Null, Default | 建立時間，預設為 `CURRENT_TIMESTAMP`。 |
| `dfa_dc` | VARCHAR(1) | Not Null, Default | 作廢註記 (Y/N)。預設為 'N'。 |
| `dfa_dcby` | VARCHAR(50) | Nullable | 執行作廢操作的操作者帳號。 |
| `dfa_dcat` | TIMESTAMP | Nullable | 作廢時間。 |

---

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE dms_folder_acl (
    dfa_id SERIAL PRIMARY KEY,
    df_fid INTEGER NOT NULL,
    dfa_type SMALLINT NOT NULL,
    dfa_target VARCHAR(50),
    dfa_crtby VARCHAR(50) NOT NULL,
    dfa_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dfa_dc VARCHAR(1) NOT NULL DEFAULT 'N',
    dfa_dcby VARCHAR(50),
    dfa_dcat TIMESTAMP
);

-- 建立索引以提升查詢效能 (僅計算未作廢者)
CREATE INDEX idx_dms_folder_acl_fid ON dms_folder_acl(df_fid) WHERE dfa_dc = 'N';
CREATE INDEX idx_dms_folder_acl_target ON dms_folder_acl(dfa_type, dfa_target) WHERE dfa_dc = 'N';

-- 欄位與資料表註解
COMMENT ON TABLE dms_folder_acl IS '資料夾存取控制表';
COMMENT ON COLUMN dms_folder_acl.dfa_id IS '唯一識別碼，自動遞增';
COMMENT ON COLUMN dms_folder_acl.df_fid IS '關聯至 dms_folders 的資料夾 ID';
COMMENT ON COLUMN dms_folder_acl.dfa_type IS '授權類型。1: 群組 (部門), 2: 特定使用者';
COMMENT ON COLUMN dms_folder_acl.dfa_target IS '授權目標對象。若 dfa_type = 1 為群組 ID；若 dfa_type = 2 為使用者帳號';
COMMENT ON COLUMN dms_folder_acl.dfa_crtby IS '建立此權限規則的資料夾管理員帳號';
COMMENT ON COLUMN dms_folder_acl.dfa_crtat IS '建立時間，預設為目前時間';
COMMENT ON COLUMN dms_folder_acl.dfa_dc IS '作廢註記 (Y/N)';
COMMENT ON COLUMN dms_folder_acl.dfa_dcby IS '執行作廢操作的操作者帳號';
COMMENT ON COLUMN dms_folder_acl.dfa_dcat IS '作廢時間';
```
