# 資料表結構：dms_ann（系統公告主檔）

本文件紀錄 DMS V6 `dms_ann` 資料表結構定義。

本文件依據 `system_specifications.md` 第 1.5 節「資料表與欄位命名規則」製作。`da_` 已由 `dms_admins` 使用，因此公告主檔採 `dan_` 前綴，避免欄位縮寫衝突。

本專案資料庫不建立實體 `FOREIGN KEY` 與額外 `CONSTRAINT`。資料有效性與公告生命週期由後端 API 交易檢核維護。

---

## 1. 資料表說明

* **表名稱**：`dms_ann`
* **schema 檔名**：`schema_dms_ann.md`
* **用途**：保存儀表板公告的內容、重要程度、生命週期、對象、發佈時間、下架時間及異動資訊。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `dan_id` | SERIAL | Not Null | 公告識別碼，自動遞增。 |
| `dan_title` | VARCHAR(120) | Not Null | 公告標題，最多 120 字。 |
| `dan_body` | TEXT | Not Null | 公告純文字內容，後端限制最多 2000 字。 |
| `dan_priority` | SMALLINT | Not Null, Default | 重要程度。1：一般，2：重要，3：緊急；預設為 1。 |
| `dan_status` | SMALLINT | Not Null, Default | 狀態。0：草稿，1：已發佈，2：已封存；預設為 0。 |
| `dan_rev` | INTEGER | Not Null, Default | 公告版次，預設為 1。 |
| `dan_aud_all` | VARCHAR(1) | Not Null, Default | 是否提供全體使用者，`Y` 或 `N`；預設為 `Y`。 |
| `dan_aud_admin` | VARCHAR(1) | Not Null, Default | 是否提供系統管理員，`Y` 或 `N`；預設為 `N`。 |
| `dan_aud_mgr` | VARCHAR(1) | Not Null, Default | 是否提供資料夾管理員及協同管理員，`Y` 或 `N`；預設為 `N`。 |
| `dan_pub_at` | TIMESTAMP | Nullable | 發佈或預約發佈時間。 |
| `dan_exp_at` | TIMESTAMP | Nullable | 選填下架時間。 |
| `dan_crtby` | VARCHAR(50) | Not Null | 建立者帳號。 |
| `dan_crtat` | TIMESTAMP | Not Null, Default | 建立時間，預設為 `CURRENT_TIMESTAMP`。 |
| `dan_updby` | VARCHAR(50) | Nullable | 最後異動者帳號。 |
| `dan_updat` | TIMESTAMP | Nullable | 最後異動時間。 |

---

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE IF NOT EXISTS dms_ann (
    dan_id SERIAL NOT NULL,
    dan_title VARCHAR(120) NOT NULL,
    dan_body TEXT NOT NULL,
    dan_priority SMALLINT NOT NULL DEFAULT 1,
    dan_status SMALLINT NOT NULL DEFAULT 0,
    dan_rev INTEGER NOT NULL DEFAULT 1,
    dan_aud_all VARCHAR(1) NOT NULL DEFAULT 'Y',
    dan_aud_admin VARCHAR(1) NOT NULL DEFAULT 'N',
    dan_aud_mgr VARCHAR(1) NOT NULL DEFAULT 'N',
    dan_pub_at TIMESTAMP,
    dan_exp_at TIMESTAMP,
    dan_crtby VARCHAR(50) NOT NULL,
    dan_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dan_updby VARCHAR(50),
    dan_updat TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dms_ann_status_time
ON dms_ann(dan_status, dan_pub_at, dan_exp_at);

CREATE INDEX IF NOT EXISTS idx_dms_ann_updat
ON dms_ann(dan_updat);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_dms_ann_id
ON dms_ann(dan_id);
```

唯一索引 `uidx_dms_ann_id` 保證公告識別碼不可重複；依專案規則不建立 `PRIMARY KEY` 或額外 `CONSTRAINT`。

索引只使用原始欄位，不使用函數或型別轉換。

---

## 3. 後端檢核規則

* 標題不可為空白且不得超過 120 字；內容不可為空白且不得超過 2000 字。
* `dan_priority` 只接受 1、2、3；`dan_status` 只能依「草稿 → 已發佈 → 已封存」前進。
* `dan_exp_at` 有值時，必須晚於 `dan_pub_at`。
* `dan_aud_all = 'Y'` 時，`dan_aud_admin` 與 `dan_aud_mgr` 必須為 `N`；角色對象至少選取 1 種。
* 修改已發佈公告時，`dan_rev` 必須增加 1；舊版已讀紀錄不得刪除。
* 修改或封存時，後端先鎖定公告並比對請求版次；版次不一致回傳 HTTP `409`。
* 已封存公告唯讀，不提供實體刪除或重新發佈。
