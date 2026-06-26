# 資料表結構：dms_admins (系統管理員表)

本文件紀錄文件管理系統 V4 (DMS V4) 之系統管理員表結構定義。

---

## 1. 資料表說明

*   **表名稱**：dms_admins
*   **用途**：紀錄具備 DMS 系統最高管理權限之員工（系統管理員）。當使用者登入後，系統將比對此表以決定是否給予系統管理選單與全域管理權限。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `da_id` | SERIAL (INT) | Primary Key | 唯一識別碼，自動遞增。 |
| `emp_id` | VARCHAR(8) | Not Null (邏輯外鍵) | 員工編號，邏輯關聯至 `employee(emp_id)`。 |
| `da_crtby` | VARCHAR(8) | Not Null | 建立此管理員設定的操作者員編。 |
| `da_crtat` | TIMESTAMP | Not Null, Default | 建立時間，預設為 `CURRENT_TIMESTAMP`。 |
| `da_dc` | VARCHAR(1) | Not Null, Default | 作廢註記 (Y/N)。預設為 'N'。 |
| `da_dcby` | VARCHAR(8) | Nullable | 執行作廢操作的操作者員編。 |
| `da_dcat` | TIMESTAMP | Nullable | 作廢時間。 |

---

## 2. PostgreSQL DDL 語法

```sql
-- 建立系統管理員資料表
CREATE TABLE dms_admins (
    da_id SERIAL PRIMARY KEY,
    emp_id VARCHAR(8) NOT NULL,
    da_crtby VARCHAR(8) NOT NULL,
    da_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    da_dc VARCHAR(1) NOT NULL DEFAULT 'N',
    da_dcby VARCHAR(8),
    da_dcat TIMESTAMP
);

-- 建立唯一部分索引，確保未作廢的員工在管理員名單中不重複
CREATE UNIQUE INDEX uidx_dms_admins_emp ON dms_admins(emp_id) WHERE da_dc = 'N';

-- 欄位與資料表註解
COMMENT ON TABLE dms_admins IS '系統管理員表';
COMMENT ON COLUMN dms_admins.da_id IS '唯一識別碼，自動遞增';
COMMENT ON COLUMN dms_admins.emp_id IS '員工編號，關聯至 employee(emp_id)';
COMMENT ON COLUMN dms_admins.da_crtby IS '建立此管理員設定的操作者員編';
COMMENT ON COLUMN dms_admins.da_crtat IS '建立時間，預設為目前時間';
COMMENT ON COLUMN dms_admins.da_dc IS '作廢註記 (Y/N)';
COMMENT ON COLUMN dms_admins.da_dcby IS '執行作廢操作的操作者員編';
COMMENT ON COLUMN dms_admins.da_dcat IS '作廢時間';
```
