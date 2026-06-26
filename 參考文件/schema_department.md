# 資料表結構：department (部門組織表)

本文件紀錄文件管理系統 V4 (DMS V4) 之部門組織表結構定義。

---

## 1. 資料表說明

*   **表名稱**：department
*   **用途**：紀錄系統內所有部門組織架構，包含部門編號、名稱、上層部門關係、部門主管以及部門層級，作為系統組織關聯與人員隸屬關係之依據。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `dept_id` | INTEGER | Primary Key | 部門唯一識別碼。 |
| `dept_name` | VARCHAR(21) | Not Null | 部門名稱。 |
| `dept_fid` | INTEGER | Nullable (邏輯外鍵) | 上級部門 ID，邏輯上關聯至 `department(dept_id)`。 |
| `dept_supervisor` | VARCHAR(20) | Nullable (邏輯外鍵) | 部門主管員編，邏輯上關聯至 `employee(emp_id)`（以分號分隔多個主管代碼）。 |
| `dept_class` | INTEGER | Nullable | 部門層級。 |

---

## 2. PostgreSQL DDL 語法

```sql
-- 建立部門組織資料表
CREATE TABLE department (
    dept_id INTEGER PRIMARY KEY,
    dept_name VARCHAR(21) NOT NULL,
    dept_fid INTEGER,
    dept_supervisor VARCHAR(20),
    dept_class INTEGER
);

-- 欄位與資料表註解
COMMENT ON TABLE department IS '部門組織表';
COMMENT ON COLUMN department.dept_id IS '部門 ID';
COMMENT ON COLUMN department.dept_name IS '部門名稱';
COMMENT ON COLUMN department.dept_fid IS '上級部門 ID，邏輯上關聯至 department(dept_id)';
COMMENT ON COLUMN department.dept_supervisor IS '部門主管，邏輯上關聯至 employee(emp_id)';
COMMENT ON COLUMN department.dept_class IS '部門層級';
```