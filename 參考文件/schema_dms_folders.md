# 資料表結構：dms_folders (資料夾)

本文件紀錄 DMS V5 之 `dms_folders` 資料表結構定義。

本文件依據 `system_specifications.md` 第 1.5 節「資料表與欄位命名規則」製作。資料表名稱與 schema 檔名一致，檔名前綴統一使用 `schema_`。

本專案資料庫不建立實體 `FOREIGN KEY` 與實體 `CONSTRAINT`。下列關聯欄位僅為邏輯關聯，完整性由後端 API 交易檢核維護。

---

## 1. 資料表說明

* **表名稱**：`dms_folders`
* **schema 檔名**：`schema_dms_folders.md`、`schema_dms_folders.html`
* **用途**：儲存資料夾樹狀結構，並包含狀態、追蹤與封存紀錄。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `df_fid` | SERIAL (INT) | Primary Key | 資料夾唯一識別碼，自動遞增編號。 |
| `df_pid` | INTEGER | Nullable | 父資料夾 ID。若為根目錄則為 NULL。對應至此表的 `df_fid`。 |
| `df_root_fid` | INTEGER | Not Null | 根目錄的第一層資料夾 ID。若為第一層資料夾則等於 `df_fid`。用於 ACL 權限極速比對。 |
| `df_name` | VARCHAR(255) | Not Null | 資料夾名稱。 |
| `df_status` | SMALLINT | Not Null | 資料夾狀態。0: 已刪除(作廢), 1: 正常, 2: 封存。預設為 1。 |
| `df_access_type` | SMALLINT | Not Null | 資料夾存取狀態。1: 公開, 2: 限閱, 3: 僅限管理者。預設為 3。 |
| `df_crtby` | VARCHAR(50) | Not Null | 建立者的使用者帳號。 |
| `df_crtat` | TIMESTAMP | Not Null, Default | 建立時間，預設為 `CURRENT_TIMESTAMP`。 |
| `df_updby` | VARCHAR(50) | Nullable | 最後執行異動操作的使用者帳號。 |
| `df_updat` | TIMESTAMP | Nullable | 最後異動時間。 |
| `df_arcby` | VARCHAR(50) | Nullable | 執行封存操作的管理員帳號。 |
| `df_arcat` | TIMESTAMP | Nullable | 執行封存操作的時間。 |

---

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE dms_folders (
    df_fid SERIAL PRIMARY KEY,
    df_pid INTEGER,
    df_root_fid INTEGER NOT NULL,
    df_name VARCHAR(255) NOT NULL,
    df_status SMALLINT NOT NULL DEFAULT 1,
    df_access_type SMALLINT NOT NULL DEFAULT 3,
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
```

### 既有資料庫升級語法

```sql
ALTER TABLE dms_folders
ADD COLUMN IF NOT EXISTS df_access_type SMALLINT NOT NULL DEFAULT 3;

ALTER TABLE dms_folders
ALTER COLUMN df_access_type SET DEFAULT 3;

UPDATE dms_folders f
   SET df_access_type = 3
 WHERE f.df_access_type = 2
   AND NOT EXISTS (
         SELECT 1
           FROM dms_folder_acl a
           LEFT JOIN department d
             ON a.dfa_type = 1
            AND a.dfa_target = d.dept_id::text
           LEFT JOIN employee e
             ON a.dfa_type = 2
            AND a.dfa_target = e.emp_id
            AND e.emp_incumbent = 0
          WHERE a.df_fid = f.df_fid
            AND a.dfa_dc = 'N'
            AND (
                 (a.dfa_type = 1 AND d.dept_id IS NOT NULL)
                 OR (a.dfa_type = 2 AND e.emp_id IS NOT NULL)
            )
       );

CREATE INDEX IF NOT EXISTS idx_dms_folders_access_type
ON dms_folders(df_access_type);
```

---

## 3. 欄位與資料表註解

```sql
COMMENT ON TABLE dms_folders IS '資料夾';
COMMENT ON COLUMN dms_folders.df_fid IS '資料夾唯一識別碼，自動遞增編號';
COMMENT ON COLUMN dms_folders.df_pid IS '父資料夾 ID。若為根目錄則為 NULL。對應至 dms_folders(df_fid)';
COMMENT ON COLUMN dms_folders.df_root_fid IS '根目錄的第一層資料夾 ID。若為第一層資料夾則等於 df_fid。用於 ACL 權限極速比對';
COMMENT ON COLUMN dms_folders.df_name IS '資料夾名稱';
COMMENT ON COLUMN dms_folders.df_status IS '資料夾狀態。0: 已刪除(作廢), 1: 正常, 2: 封存';
COMMENT ON COLUMN dms_folders.df_access_type IS '資料夾存取狀態。1: 公開, 2: 限閱, 3: 僅限管理者';
COMMENT ON COLUMN dms_folders.df_crtby IS '建立者的使用者帳號';
COMMENT ON COLUMN dms_folders.df_crtat IS '建立時間，預設為目前時間';
COMMENT ON COLUMN dms_folders.df_updby IS '最後執行異動操作的使用者帳號';
COMMENT ON COLUMN dms_folders.df_updat IS '最後異動時間';
COMMENT ON COLUMN dms_folders.df_arcby IS '執行封存操作的管理員帳號';
COMMENT ON COLUMN dms_folders.df_arcat IS '執行封存操作的時間';
```

---

## 4. 常用查詢方向

查詢子資料夾清單：

```sql
SELECT df_fid,
       df_pid,
       df_root_fid,
       df_name,
       df_status,
       df_access_type
  FROM dms_folders
 WHERE df_pid = :parent_id
   AND df_status = 1
 ORDER BY df_name ASC;
```

查閱特定資料夾的根目錄節點 ID：

```sql
SELECT df_root_fid
  FROM dms_folders
 WHERE df_fid = :folder_id;
```

---

## 5. 後端檢核規則

* 父資料夾 ID `df_pid` 若非 NULL，必須存在於 `dms_folders.df_fid`。
* 第一層資料夾（根目錄）的 `df_pid` 為 NULL，其 `df_root_fid` 必須等於自身的 `df_fid`。其餘子資料夾的 `df_root_fid` 必須繼承父資料夾的 `df_root_fid`。
* 當資料夾狀態 `df_status` 由 1（正常）變更為 2（封存）時，後端應以短交易遞迴更新其下所有子資料夾之 `df_status = 2`，並將底下所有文件的 `dd_status` 設為 2（廢止，且 `dd_obs_src = 2`）。
* 資料夾狀態為 2（封存）或 0（刪除）時，不允許在底下建立新的子資料夾或上傳文件。
* 系統一般功能不提供物理刪除（DELETE）資料夾，異動一律以狀態註記變更為 0（刪除）或 2（封存）處理。
