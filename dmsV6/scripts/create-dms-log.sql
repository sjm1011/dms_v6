CREATE TABLE IF NOT EXISTS dms_log (
    dl_id SERIAL PRIMARY KEY,
    dl_event_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dl_actor_uid VARCHAR(50),
    dl_actor_name VARCHAR(255),
    dl_actor_role VARCHAR(20),
    dl_action VARCHAR(80) NOT NULL,
    dl_resource_type VARCHAR(30),
    dl_resource_id VARCHAR(80),
    dl_managed_df_fid INTEGER,
    df_fid INTEGER,
    dd_id INTEGER,
    ddv_id INTEGER,
    dl_result VARCHAR(20) NOT NULL,
    dl_ip_address VARCHAR(80),
    dl_user_agent TEXT,
    dl_request_id VARCHAR(80),
    dl_reason TEXT,
    dl_before_data JSONB,
    dl_after_data JSONB,
    dl_metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_dms_log_event_at
ON dms_log(dl_event_at);

CREATE INDEX IF NOT EXISTS idx_dms_log_actor
ON dms_log(dl_actor_uid, dl_event_at);

CREATE INDEX IF NOT EXISTS idx_dms_log_action
ON dms_log(dl_action, dl_event_at);

CREATE INDEX IF NOT EXISTS idx_dms_log_result
ON dms_log(dl_result, dl_event_at);

CREATE INDEX IF NOT EXISTS idx_dms_log_folder
ON dms_log(df_fid, dl_event_at);

CREATE INDEX IF NOT EXISTS idx_dms_log_document
ON dms_log(dd_id, dl_event_at);

CREATE INDEX IF NOT EXISTS idx_dms_log_version
ON dms_log(ddv_id, dl_event_at);

CREATE INDEX IF NOT EXISTS idx_dms_log_managed_folder
ON dms_log(dl_managed_df_fid, dl_event_at);

COMMENT ON TABLE dms_log IS '系統稽核紀錄';
COMMENT ON COLUMN dms_log.dl_id IS '稽核紀錄唯一識別碼';
COMMENT ON COLUMN dms_log.dl_event_at IS '事件發生時間';
COMMENT ON COLUMN dms_log.dl_actor_uid IS '操作者帳號';
COMMENT ON COLUMN dms_log.dl_actor_name IS '操作者姓名';
COMMENT ON COLUMN dms_log.dl_actor_role IS '操作者登入角色。ADMIN：系統管理員，USER：一般使用者';
COMMENT ON COLUMN dms_log.dl_action IS '動作代碼';
COMMENT ON COLUMN dms_log.dl_resource_type IS '被操作的資源類型';
COMMENT ON COLUMN dms_log.dl_resource_id IS '被操作資源的主要識別碼';
COMMENT ON COLUMN dms_log.dl_managed_df_fid IS '事件所屬管理資料夾節點識別碼';
COMMENT ON COLUMN dms_log.df_fid IS '事件所屬資料夾識別碼';
COMMENT ON COLUMN dms_log.dd_id IS '事件所屬文件主檔識別碼';
COMMENT ON COLUMN dms_log.ddv_id IS '事件所屬文件版本識別碼';
COMMENT ON COLUMN dms_log.dl_result IS '執行結果。SUCCESS：成功，FAILED：失敗，DENIED：拒絕';
COMMENT ON COLUMN dms_log.dl_ip_address IS '使用者來源 IP 位址';
COMMENT ON COLUMN dms_log.dl_user_agent IS '瀏覽器或用戶端識別資訊';
COMMENT ON COLUMN dms_log.dl_request_id IS '後端請求追蹤識別碼';
COMMENT ON COLUMN dms_log.dl_reason IS '使用者填寫或系統產生的原因';
COMMENT ON COLUMN dms_log.dl_before_data IS '異動前資料快照';
COMMENT ON COLUMN dms_log.dl_after_data IS '異動後資料快照';
COMMENT ON COLUMN dms_log.dl_metadata IS '額外資料';
