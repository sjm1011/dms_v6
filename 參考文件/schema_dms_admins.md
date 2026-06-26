# 資料表結構：dms_admins (系統管理員表)

本文件紀錄 DMS V5 之 `dms_admins` 資料表結構定義。

本文件依據 `system_specifications.md` 第 1.5 節「資料表與欄位命名規則」製作。資料表名稱與 schema 檔名一致，檔名前綴統一使用 `schema_`。

本專案資料庫不建立實體 `FOREIGN KEY` 與實體 `CONSTRAINT`。下列關聯欄位僅為邏輯關聯，完整性由後端 API 交易檢核維護。

---

## 1. 資料表說明

* **表名稱**：`dms_admins`
* **schema 檔名**：`schema_dms_admins.md`、`schema_dms_admins.html`
* **用途**：紀錄具備 DMS 系統最高管理權限之員工（系統管理員）。當使用者登入後，系統將比對此表以決定是否給予系統管理選單與全域管理權限。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `da_id` | SERIAL (INT) | Primary Key | 唯一識別碼，自動遞增。 |
| `emp_id` | VARCHAR(8) | Not Null | 員工編號，邏輯關聯至 `employee.emp_id`。 |
| `da_crtby` | VARCHAR(8) | Not Null | 建立此管理員設定的操作者員編。 |
| `da_crtat` | TIMESTAMP | Not Null, Default | 建立時間，預設為 `CURRENT_TIMESTAMP`。 |
| `da_dc` | VARCHAR(1) | Not Null, Default | 作廢註記 (Y/N)。預設為 'N'。 |
| `da_dcby` | VARCHAR(8) | Nullable | 執行作廢操作的操作者員編。 |
| `da_dcat` | TIMESTAMP | Nullable | 作廢時間。 |

---

## 2. PostgreSQL DDL 語法

```sql
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
```

---

## 3. 欄位與資料表註解

```sql
COMMENT ON TABLE dms_admins IS '系統管理員表';
COMMENT ON COLUMN dms_admins.da_id IS '唯一識別碼，自動遞增';
COMMENT ON COLUMN dms_admins.emp_id IS '員工編號，關聯至 employee(emp_id)';
COMMENT ON COLUMN dms_admins.da_crtby IS '建立此管理員設定的操作者員編';
COMMENT ON COLUMN dms_admins.da_crtat IS '建立時間，預設為目前時間';
COMMENT ON COLUMN dms_admins.da_dc IS '作廢註記 (Y/N)';
COMMENT ON COLUMN dms_admins.da_dcby IS '執行作廢操作的操作者員編';
COMMENT ON COLUMN dms_admins.da_dcat IS '作廢時間';
```

---

## 4. 常用查詢方向

查詢特定員工是否為有效系統管理員：

```sql
SELECT da_id,
       emp_id
  FROM dms_admins
 WHERE emp_id = :emp_id
   AND da_dc = 'N';
```

查詢所有有效系統管理員列表：

```sql
SELECT a.da_id,
       a.emp_id,
       e.emp_name,
       a.da_crtat
  FROM dms_admins a
  JOIN employee e ON e.emp_id = a.emp_id
 WHERE a.da_dc = 'N'
   AND e.emp_status = 1;
```

---

## 5. 後端檢核規則

* `emp_id` 必須存在於有效的 `employee.emp_id`。
* 同一員工在未作廢狀態（`da_dc = 'N'`）下，只能有一筆關聯紀錄。
* 作廢管理員權限時，必須寫入作廢執行者員編 `da_dcby` 與作廢時間 `da_dcat`，且將 `da_dc` 設為 `'Y'`。
* 系統不提供物理刪除（DELETE）系統管理員設定，異動一律以作廢（da_dc = 'Y'）處理。
* 當使用者登入時，後端應依據此表判斷並返回其系統管理員身分。
