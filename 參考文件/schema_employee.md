# 資料表結構：employee (員工資料表)

本文件紀錄文件管理系統 V4 (DMS V4) 之員工資料表結構定義。

---

## 1. 資料表說明

*   **表名稱**：employee
*   **用途**：紀錄系統內所有員工的基本資料、系統登入密碼、部門關聯、職稱、在職狀態以及系統操作權限。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `emp_id` | VARCHAR(8) | Primary Key, Not Null | 員工編號（員編），為本表之唯一主鍵。 |
| `emp_pw` | VARCHAR(32) | Not Null | 系統登入密碼，MD5。 |
| `emp_name` | VARCHAR(18) | Not Null | 員工姓名。 |
| `dept_id` | NUMERIC | Nullable | 部門 ID。 |
| `emp_position` | VARCHAR(30) | Nullable | 職稱。 |
| `emp_incumbent` | NUMERIC | Not Null | 在職狀態。0: 在職，1: 離職。 |
| `emp_due_date` | TIMESTAMP | Nullable | 到職日期。 |
| `emp_resign_date` | TIMESTAMP | Nullable | 離職日期。 |
| `auth_id` | VARCHAR(8) | Nullable | 權限群組 ID。 |
| `data_create` | TIMESTAMP | Nullable | 記錄建立時間。 |
| `data_creator` | VARCHAR(8) | Nullable | 記錄建立者員編。 |
| `data_update` | TIMESTAMP | Nullable | 記錄更新時間。 |
| `data_changer` | VARCHAR(8) | Nullable | 記錄更新者員編。 |
| `emp_new` | NUMERIC | Nullable | 是否為新進同仁。 |
| `emp_email` | VARCHAR(30) | Nullable | 醫院官方信箱。 |
| `emp_job_position` | NUMERIC | Nullable | 職務身份類型。1: 正職員工，2: 監職員工，3: 工讀生。 |
| `emp_email1` | VARCHAR(30) | Nullable | 常用個人信箱。 |

---

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE employee (
    emp_id VARCHAR(8) PRIMARY KEY,
    emp_pw VARCHAR(32) NOT NULL,
    emp_name VARCHAR(18) NOT NULL,
    dept_id NUMERIC,
    emp_position VARCHAR(30),
    emp_incumbent NUMERIC NOT NULL DEFAULT 0,
    emp_due_date TIMESTAMP,
    emp_resign_date TIMESTAMP,
    auth_id VARCHAR(8),
    data_create TIMESTAMP,
    data_creator VARCHAR(8),
    data_update TIMESTAMP,
    data_changer VARCHAR(8),
    emp_new NUMERIC,
    emp_email VARCHAR(30),
    emp_job_position NUMERIC,
    emp_email1 VARCHAR(30)
);

-- 欄位與資料表註解
COMMENT ON TABLE employee IS '員工資料表';
COMMENT ON COLUMN employee.emp_id IS '員編';
COMMENT ON COLUMN employee.emp_pw IS '系統密碼';
COMMENT ON COLUMN employee.emp_name IS '員工姓名';
COMMENT ON COLUMN employee.dept_id IS '部門';
COMMENT ON COLUMN employee.emp_position IS '職稱';
COMMENT ON COLUMN employee.emp_incumbent IS '0在職1離職';
COMMENT ON COLUMN employee.emp_due_date IS '到職日';
COMMENT ON COLUMN employee.emp_resign_date IS '離職日';
COMMENT ON COLUMN employee.auth_id IS '權限';
COMMENT ON COLUMN employee.data_create IS '記錄建立時間';
COMMENT ON COLUMN employee.data_creator IS '記錄建立者員編';
COMMENT ON COLUMN employee.data_update IS '記錄更新時間';
COMMENT ON COLUMN employee.data_changer IS '記錄更新者員編';
COMMENT ON COLUMN employee.emp_new IS '是否新進同仁';
COMMENT ON COLUMN employee.emp_email IS '醫院信箱';
COMMENT ON COLUMN employee.emp_job_position IS '1:正職員工;2:監職員工;3:工讀生';
COMMENT ON COLUMN employee.emp_email1 IS '常用信箱';
```
