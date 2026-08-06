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

COMMENT ON TABLE dms_ann IS '系統公告主檔';
COMMENT ON COLUMN dms_ann.dan_id IS '公告識別碼';
COMMENT ON COLUMN dms_ann.dan_title IS '公告標題';
COMMENT ON COLUMN dms_ann.dan_body IS '公告純文字內容';
COMMENT ON COLUMN dms_ann.dan_priority IS '重要程度。1：一般，2：重要，3：緊急';
COMMENT ON COLUMN dms_ann.dan_status IS '公告狀態。0：草稿，1：已發佈，2：已封存';
COMMENT ON COLUMN dms_ann.dan_rev IS '公告版次';
COMMENT ON COLUMN dms_ann.dan_aud_all IS '是否提供全體使用者。Y：是，N：否';
COMMENT ON COLUMN dms_ann.dan_aud_admin IS '是否提供系統管理員。Y：是，N：否';
COMMENT ON COLUMN dms_ann.dan_aud_mgr IS '是否提供資料夾管理員及協同管理員。Y：是，N：否';
COMMENT ON COLUMN dms_ann.dan_pub_at IS '發佈或預約發佈時間';
COMMENT ON COLUMN dms_ann.dan_exp_at IS '下架時間';
COMMENT ON COLUMN dms_ann.dan_crtby IS '建立者帳號';
COMMENT ON COLUMN dms_ann.dan_crtat IS '建立時間';
COMMENT ON COLUMN dms_ann.dan_updby IS '最後異動者帳號';
COMMENT ON COLUMN dms_ann.dan_updat IS '最後異動時間';

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

COMMENT ON TABLE dms_ann_read IS '使用者公告已讀紀錄';
COMMENT ON COLUMN dms_ann_read.danr_id IS '已讀紀錄識別碼';
COMMENT ON COLUMN dms_ann_read.dan_id IS '公告識別碼';
COMMENT ON COLUMN dms_ann_read.danr_rev IS '使用者已讀的公告版次';
COMMENT ON COLUMN dms_ann_read.danr_uid IS '使用者帳號';
COMMENT ON COLUMN dms_ann_read.danr_read_at IS '已讀時間';
