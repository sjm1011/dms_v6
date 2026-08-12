# 資料表結構：dms_user_preferences（DMS 使用者個人偏好設定）

## 1. 用途

保存每位 DMS 使用者的個人顯示偏好。目前僅保存佈景主題，設定會跟隨使用者帳號，跨瀏覽器與電腦套用。

## 2. 欄位

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `dup_uid` | VARCHAR(50) | 是 | 使用者帳號，邏輯關聯至 `employee.emp_id`。 |
| `dup_theme` | VARCHAR(20) | 是 | `modern-dark` 為深色，`modern-light` 為淺色。 |
| `dup_crtby` | VARCHAR(50) | 是 | 建立者帳號。 |
| `dup_crtat` | TIMESTAMP | 是 | 建立時間。 |
| `dup_updby` | VARCHAR(50) | 否 | 最後異動者帳號。 |
| `dup_updat` | TIMESTAMP | 否 | 最後異動時間。 |

## 3. PostgreSQL DDL

```sql
CREATE TABLE dms_user_preferences (
    dup_uid VARCHAR(50) NOT NULL,
    dup_theme VARCHAR(20) NOT NULL DEFAULT 'modern-light',
    dup_crtby VARCHAR(50) NOT NULL,
    dup_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dup_updby VARCHAR(50),
    dup_updat TIMESTAMP
);

CREATE UNIQUE INDEX uidx_dms_user_preferences_uid
ON dms_user_preferences(dup_uid);
```

## 4. 資料規則

- 每位使用者只能有 1 筆設定，由 `uidx_dms_user_preferences_uid` 保證唯一性。
- 一般登入的首次設定採用登入畫面所選佈景主題；已有設定時不得由登入畫面覆寫。
- 外部網站自動登入的首次設定為淺色；已有設定時不得覆寫。
- 只接受 `modern-dark` 與 `modern-light`。
- 本表不建立 foreign key，使用者有效性由既有登入與 Session 驗證流程保證。
