# 資料表結構：dms_ann_read（公告已讀紀錄）

本文件紀錄 DMS V6 `dms_ann_read` 資料表結構定義。

本文件依據 `system_specifications.md` 第 1.5 節「資料表與欄位命名規則」製作。資料表使用 `danr_` 前綴；`dan_id` 沿用公告主檔識別碼名稱，邏輯關聯至 `dms_ann.dan_id`。

本專案資料庫不建立實體 `FOREIGN KEY` 與額外 `CONSTRAINT`。關聯完整性與寫入權限由後端 API 交易檢核維護。

---

## 1. 資料表說明

* **表名稱**：`dms_ann_read`
* **schema 檔名**：`schema_dms_ann_read.md`
* **用途**：保存使用者主動標示已讀的公告識別碼、公告版次及已讀時間。

### 欄位規劃

| 欄位名稱 | 資料型態 | 屬性 | 說明 |
| :--- | :--- | :--- | :--- |
| `danr_id` | SERIAL | Not Null | 已讀紀錄識別碼，自動遞增。 |
| `dan_id` | INTEGER | Not Null | 公告識別碼，邏輯關聯至 `dms_ann.dan_id`。 |
| `danr_rev` | INTEGER | Not Null | 使用者已讀的公告版次。 |
| `danr_uid` | VARCHAR(50) | Not Null | 使用者帳號。 |
| `danr_read_at` | TIMESTAMP | Not Null, Default | 已讀時間，預設為 `CURRENT_TIMESTAMP`。 |

---

## 2. PostgreSQL DDL 語法

```sql
CREATE TABLE IF NOT EXISTS dms_ann_read (
    danr_id SERIAL NOT NULL,
    dan_id INTEGER NOT NULL,
    danr_rev INTEGER NOT NULL,
    danr_uid VARCHAR(50) NOT NULL,
    danr_read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dms_ann_read_ann
ON dms_ann_read(dan_id, danr_rev);

CREATE INDEX IF NOT EXISTS idx_dms_ann_read_uid
ON dms_ann_read(danr_uid, danr_read_at);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_dms_ann_read_identity
ON dms_ann_read(dan_id, danr_rev, danr_uid);
```

唯一索引 `uidx_dms_ann_read_identity` 使同一使用者對同一公告版次的已讀寫入具備冪等性。索引只使用原始欄位，不使用函數或型別轉換。

---

## 3. 後端檢核規則

* 寫入前必須驗證有效 Session、公告已發佈且目前有效、使用者屬於公告對象，以及請求版次與公告目前版次一致。
* 跨公告對象的寫入回傳 HTTP `403`；公告版次不一致回傳 HTTP `409`。
* 重複標示同一公告版次為已讀時，不新增第二筆資料，只更新 `danr_read_at`。
* 公告改版後以新的 `danr_rev` 寫入；舊版已讀紀錄保留。
* 公告已讀屬個人狀態，只寫入 `dms_ann_read`，不逐筆寫入 `dms_log`。
