CREATE TABLE IF NOT EXISTS dms_purge_job (
    dpj_id SERIAL PRIMARY KEY,
    df_fid INTEGER NOT NULL,
    dpj_status VARCHAR(30) NOT NULL,
    dpj_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
    dpj_requested_by VARCHAR(50) NOT NULL,
    dpj_requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dpj_completed_at TIMESTAMP,
    dpj_retry_count INTEGER NOT NULL DEFAULT 0,
    dpj_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_dms_purge_job_status
ON dms_purge_job(dpj_status, dpj_requested_at);

CREATE INDEX IF NOT EXISTS idx_dms_purge_job_folder
ON dms_purge_job(df_fid, dpj_requested_at);

COMMENT ON TABLE dms_purge_job IS '封存資料夾實體檔案清理工作';
COMMENT ON COLUMN dms_purge_job.dpj_id IS '清理工作識別碼';
COMMENT ON COLUMN dms_purge_job.df_fid IS '封存批次根資料夾 ID';
COMMENT ON COLUMN dms_purge_job.dpj_status IS 'PREPARING、CLEANUP_PENDING、COMPLETED 或 FAILED';
COMMENT ON COLUMN dms_purge_job.dpj_manifest IS '原始與隔離檔案清單';
COMMENT ON COLUMN dms_purge_job.dpj_requested_by IS '執行永久刪除的管理員帳號';
COMMENT ON COLUMN dms_purge_job.dpj_requested_at IS '建立時間';
COMMENT ON COLUMN dms_purge_job.dpj_completed_at IS '清理完成時間';
COMMENT ON COLUMN dms_purge_job.dpj_retry_count IS '清理重試次數';
COMMENT ON COLUMN dms_purge_job.dpj_error IS '最近一次失敗原因';
