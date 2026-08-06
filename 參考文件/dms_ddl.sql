-- DMS V6 PostgreSQL DDL
-- 來源：參考文件/schema_dms_*.md
-- 本檔僅包含 dms_ 開頭資料表、索引及註解，不建立 FOREIGN KEY。

BEGIN;

-- ============================================================================
-- dms_admins
-- ============================================================================

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

COMMENT ON TABLE dms_admins IS '系統管理員表';
COMMENT ON COLUMN dms_admins.da_id IS '唯一識別碼，自動遞增';
COMMENT ON COLUMN dms_admins.emp_id IS '員工編號，關聯至 employee(emp_id)';
COMMENT ON COLUMN dms_admins.da_crtby IS '建立此管理員設定的操作者員編';
COMMENT ON COLUMN dms_admins.da_crtat IS '建立時間，預設為目前時間';
COMMENT ON COLUMN dms_admins.da_dc IS '作廢註記 (Y/N)';
COMMENT ON COLUMN dms_admins.da_dcby IS '執行作廢操作的操作者員編';
COMMENT ON COLUMN dms_admins.da_dcat IS '作廢時間';

-- ============================================================================
-- dms_folders
-- ============================================================================

CREATE TABLE dms_folders (
    df_fid SERIAL PRIMARY KEY,
    df_pid INTEGER,
    df_root_fid INTEGER NOT NULL,
    df_name VARCHAR(255) NOT NULL,
    df_status SMALLINT NOT NULL DEFAULT 1,
    df_access_type SMALLINT NOT NULL DEFAULT 3,
    df_crtby VARCHAR(50) NOT NULL,
    df_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    df_updby VARCHAR(50),
    df_updat TIMESTAMP,
    df_arcby VARCHAR(50),
    df_arcat TIMESTAMP
);

-- 建立索引以提升查詢效能
CREATE INDEX idx_dms_folders_pid ON dms_folders(df_pid);
CREATE INDEX idx_dms_folders_root ON dms_folders(df_root_fid);
CREATE INDEX idx_dms_folders_status ON dms_folders(df_status);
CREATE INDEX idx_dms_folders_access_type ON dms_folders(df_access_type);

COMMENT ON TABLE dms_folders IS '資料夾';
COMMENT ON COLUMN dms_folders.df_fid IS '資料夾唯一識別碼，自動遞增編號';
COMMENT ON COLUMN dms_folders.df_pid IS '父資料夾 ID。若為根目錄則為 NULL。對應至 dms_folders(df_fid)';
COMMENT ON COLUMN dms_folders.df_root_fid IS '根目錄的第一層資料夾 ID。若為第一層資料夾則等於 df_fid。用於 ACL 權限極速比對';
COMMENT ON COLUMN dms_folders.df_name IS '資料夾名稱';
COMMENT ON COLUMN dms_folders.df_status IS '資料夾狀態。0: 已刪除(作廢), 1: 正常, 2: 封存';
COMMENT ON COLUMN dms_folders.df_access_type IS '資料夾存取狀態。1: 公開, 2: 限閱, 3: 僅限管理者';
COMMENT ON COLUMN dms_folders.df_crtby IS '建立者的使用者帳號';
COMMENT ON COLUMN dms_folders.df_crtat IS '建立時間，預設為目前時間';
COMMENT ON COLUMN dms_folders.df_updby IS '最後執行異動操作的使用者帳號';
COMMENT ON COLUMN dms_folders.df_updat IS '最後異動時間';
COMMENT ON COLUMN dms_folders.df_arcby IS '執行封存操作的管理員帳號';
COMMENT ON COLUMN dms_folders.df_arcat IS '執行封存操作的時間';

-- ============================================================================
-- dms_folder_managers
-- ============================================================================

CREATE TABLE dms_folder_managers (
    dfm_id SERIAL PRIMARY KEY,
    df_fid INTEGER NOT NULL,
    usr_uid VARCHAR(50) NOT NULL,
    dfm_type SMALLINT NOT NULL DEFAULT 2,
    dfm_crtby VARCHAR(50) NOT NULL,
    dfm_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dfm_dc VARCHAR(1) NOT NULL DEFAULT 'N',
    dfm_dcby VARCHAR(50),
    dfm_dcat TIMESTAMP
);

-- 建立索引以提升查詢效能與確保唯一性 (僅計算未作廢者)
CREATE UNIQUE INDEX idx_dms_folder_mgr_uniq ON dms_folder_managers(df_fid, usr_uid, dfm_type) WHERE dfm_dc = 'N';
CREATE UNIQUE INDEX idx_dms_folder_primary_mgr_uniq ON dms_folder_managers(df_fid, dfm_type) WHERE dfm_dc = 'N' AND dfm_type = 1;
CREATE INDEX idx_dms_folder_mgr_uid ON dms_folder_managers(usr_uid);

COMMENT ON TABLE dms_folder_managers IS '資料夾管理員';
COMMENT ON COLUMN dms_folder_managers.dfm_id IS '唯一識別碼，自動遞增';
COMMENT ON COLUMN dms_folder_managers.df_fid IS '關聯至 dms_folders 的資料夾 ID';
COMMENT ON COLUMN dms_folder_managers.usr_uid IS '被指派為管理員的使用者帳號';
COMMENT ON COLUMN dms_folder_managers.dfm_type IS '管理身分類型。1：第一層資料夾管理員，2：協同管理員';
COMMENT ON COLUMN dms_folder_managers.dfm_crtby IS '建立此設定的操作者帳號';
COMMENT ON COLUMN dms_folder_managers.dfm_crtat IS '建立時間，預設為目前時間';
COMMENT ON COLUMN dms_folder_managers.dfm_dc IS '作廢註記 (Y/N)';
COMMENT ON COLUMN dms_folder_managers.dfm_dcby IS '執行作廢操作的操作者帳號';
COMMENT ON COLUMN dms_folder_managers.dfm_dcat IS '作廢時間';

-- ============================================================================
-- dms_folder_acl
-- ============================================================================

CREATE TABLE dms_folder_acl (
    dfa_id SERIAL PRIMARY KEY,
    df_fid INTEGER NOT NULL,
    dfa_type SMALLINT NOT NULL,
    dfa_target VARCHAR(50),
    dfa_crtby VARCHAR(50) NOT NULL,
    dfa_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dfa_dc VARCHAR(1) NOT NULL DEFAULT 'N',
    dfa_dcby VARCHAR(50),
    dfa_dcat TIMESTAMP
);

-- 建立索引以提升查詢效能 (僅計算未作廢者)
CREATE INDEX idx_dms_folder_acl_fid ON dms_folder_acl(df_fid) WHERE dfa_dc = 'N';
CREATE INDEX idx_dms_folder_acl_target ON dms_folder_acl(dfa_type, dfa_target) WHERE dfa_dc = 'N';

COMMENT ON TABLE dms_folder_acl IS '資料夾存取控制表';
COMMENT ON COLUMN dms_folder_acl.dfa_id IS '唯一識別碼，自動遞增';
COMMENT ON COLUMN dms_folder_acl.df_fid IS '關聯至 dms_folders 的資料夾 ID';
COMMENT ON COLUMN dms_folder_acl.dfa_type IS '授權類型。1: 群組 (部門), 2: 特定使用者';
COMMENT ON COLUMN dms_folder_acl.dfa_target IS '授權目標對象。若 dfa_type = 1 為群組 ID；若 dfa_type = 2 為使用者帳號';
COMMENT ON COLUMN dms_folder_acl.dfa_crtby IS '建立此權限規則的資料夾管理員帳號';
COMMENT ON COLUMN dms_folder_acl.dfa_crtat IS '建立時間，預設為目前時間';
COMMENT ON COLUMN dms_folder_acl.dfa_dc IS '作廢註記 (Y/N)';
COMMENT ON COLUMN dms_folder_acl.dfa_dcby IS '執行作廢操作的操作者帳號';
COMMENT ON COLUMN dms_folder_acl.dfa_dcat IS '作廢時間';

-- ============================================================================
-- dms_doc
-- ============================================================================

CREATE TABLE dms_doc (
    dd_id SERIAL PRIMARY KEY,
    df_fid INTEGER NOT NULL,
    dd_parent_id INTEGER,
    dd_code VARCHAR(50),
    dd_title VARCHAR(255) NOT NULL,
    dd_security_level SMALLINT NOT NULL DEFAULT 1,
    dd_status SMALLINT NOT NULL DEFAULT 1,
    dd_obs_at TIMESTAMP,
    dd_obs_by VARCHAR(50),
    dd_obs_reason TEXT,
    dfi_id INTEGER,
    dd_obs_src SMALLINT,
    dd_crtby VARCHAR(50) NOT NULL,
    dd_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dd_updby VARCHAR(50),
    dd_updat TIMESTAMP
);

CREATE UNIQUE INDEX uq_dms_doc_code
ON dms_doc(dd_code)
WHERE dd_code IS NOT NULL;

CREATE INDEX idx_dms_doc_folder
ON dms_doc(df_fid, dd_status);

CREATE INDEX idx_dms_doc_parent
ON dms_doc(dd_parent_id);

CREATE INDEX idx_dms_doc_obs
ON dms_doc(dd_obs_at)
WHERE dd_status = 2;

COMMENT ON TABLE dms_doc IS '文件主檔';
COMMENT ON COLUMN dms_doc.dd_id IS '文件主檔唯一識別碼';
COMMENT ON COLUMN dms_doc.df_fid IS '所屬資料夾 ID';
COMMENT ON COLUMN dms_doc.dd_parent_id IS '主文件識別碼；空白代表第一階文件';
COMMENT ON COLUMN dms_doc.dd_code IS '文件編號';
COMMENT ON COLUMN dms_doc.dd_title IS '文件名稱';
COMMENT ON COLUMN dms_doc.dd_security_level IS '文件機敏等級。1：一般，2：敏感，3：機密；相關文件繼承主文件';
COMMENT ON COLUMN dms_doc.dd_status IS '文件狀態。1：有效，2：廢止';
COMMENT ON COLUMN dms_doc.dd_obs_at IS '廢止時間';
COMMENT ON COLUMN dms_doc.dd_obs_by IS '廢止人員帳號';
COMMENT ON COLUMN dms_doc.dd_obs_reason IS '廢止原因';
COMMENT ON COLUMN dms_doc.dfi_id IS '廢止公文檔案 ID';
COMMENT ON COLUMN dms_doc.dd_obs_src IS '廢止來源。1：手動廢止，2：資料夾封存自動廢止';
COMMENT ON COLUMN dms_doc.dd_crtby IS '建立者帳號';
COMMENT ON COLUMN dms_doc.dd_crtat IS '建立時間';
COMMENT ON COLUMN dms_doc.dd_updby IS '最後異動者帳號';
COMMENT ON COLUMN dms_doc.dd_updat IS '最後異動時間';

-- ============================================================================
-- dms_file
-- ============================================================================

CREATE TABLE dms_file (
    dfi_id SERIAL PRIMARY KEY,
    dfi_role SMALLINT NOT NULL,
    dfi_name VARCHAR(255) NOT NULL,
    dfi_path VARCHAR(1000) NOT NULL,
    dfi_ext VARCHAR(20) NOT NULL,
    dfi_mime VARCHAR(255) NOT NULL,
    dfi_size BIGINT NOT NULL DEFAULT 0,
    dfi_sha256 CHAR(64) NOT NULL,
    dfi_status SMALLINT NOT NULL DEFAULT 1,
    dfi_crtby VARCHAR(50) NOT NULL,
    dfi_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_dms_file_path
ON dms_file(dfi_path);

CREATE INDEX idx_dms_file_sha256
ON dms_file(dfi_sha256);

CREATE INDEX idx_dms_file_role
ON dms_file(dfi_role, dfi_status);

COMMENT ON TABLE dms_file IS '檔案後設資料';
COMMENT ON COLUMN dms_file.dfi_id IS '檔案唯一識別碼';
COMMENT ON COLUMN dms_file.dfi_role IS '檔案角色。1：正式發佈檔案，2：PDF 原始編修檔案，3：修訂對照表，4：廢止公文';
COMMENT ON COLUMN dms_file.dfi_name IS '原始檔名';
COMMENT ON COLUMN dms_file.dfi_path IS '實體儲存路徑';
COMMENT ON COLUMN dms_file.dfi_ext IS '副檔名';
COMMENT ON COLUMN dms_file.dfi_mime IS 'MIME Type';
COMMENT ON COLUMN dms_file.dfi_size IS '檔案大小，單位為 bytes';
COMMENT ON COLUMN dms_file.dfi_sha256 IS '檔案 SHA-256 雜湊值';
COMMENT ON COLUMN dms_file.dfi_status IS '檔案狀態。0：作廢，1：有效，2：已取代';
COMMENT ON COLUMN dms_file.dfi_crtby IS '上傳者帳號';
COMMENT ON COLUMN dms_file.dfi_crtat IS '上傳時間';

-- ============================================================================
-- dms_doc_ver
-- ============================================================================

CREATE TABLE dms_doc_ver (
    ddv_id SERIAL PRIMARY KEY,
    dd_id INTEGER NOT NULL,
    ddv_seq INTEGER NOT NULL,
    ddv_no VARCHAR(50),
    ddv_rev_date DATE NOT NULL,
    ddv_eff_at TIMESTAMP NOT NULL,
    ddv_eff_to TIMESTAMP,
    ddv_chg_note TEXT NOT NULL,
    ddv_pub_dfi_id INTEGER NOT NULL,
    ddv_src_dfi_id INTEGER,
    ddv_cancel_at TIMESTAMP,
    ddv_cancel_by VARCHAR(50),
    ddv_cancel_reason TEXT,
    ddv_crtby VARCHAR(50) NOT NULL,
    ddv_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ddv_updby VARCHAR(50),
    ddv_updat TIMESTAMP
);

CREATE UNIQUE INDEX uq_dms_doc_ver_seq
ON dms_doc_ver(dd_id, ddv_seq);

CREATE UNIQUE INDEX uq_dms_doc_ver_no
ON dms_doc_ver(dd_id, ddv_no)
WHERE ddv_no IS NOT NULL;

CREATE INDEX idx_dms_doc_ver_doc
ON dms_doc_ver(dd_id);

CREATE INDEX idx_dms_doc_ver_eff_lookup
ON dms_doc_ver(dd_id, ddv_eff_at, ddv_eff_to)
WHERE ddv_cancel_at IS NULL;

CREATE INDEX idx_dms_doc_ver_cancel
ON dms_doc_ver(ddv_cancel_at)
WHERE ddv_cancel_at IS NOT NULL;

COMMENT ON TABLE dms_doc_ver IS '文件版本';
COMMENT ON COLUMN dms_doc_ver.ddv_id IS '文件版本唯一識別碼';
COMMENT ON COLUMN dms_doc_ver.dd_id IS '文件主檔 ID';
COMMENT ON COLUMN dms_doc_ver.ddv_seq IS '系統版次流水號';
COMMENT ON COLUMN dms_doc_ver.ddv_no IS '使用者輸入版本號';
COMMENT ON COLUMN dms_doc_ver.ddv_rev_date IS '修訂日期';
COMMENT ON COLUMN dms_doc_ver.ddv_eff_at IS '生效時間';
COMMENT ON COLUMN dms_doc_ver.ddv_eff_to IS '結束時間';
COMMENT ON COLUMN dms_doc_ver.ddv_chg_note IS '異動說明';
COMMENT ON COLUMN dms_doc_ver.ddv_pub_dfi_id IS '正式發佈檔案 ID';
COMMENT ON COLUMN dms_doc_ver.ddv_src_dfi_id IS 'PDF 原始編修檔案 ID';
COMMENT ON COLUMN dms_doc_ver.ddv_cancel_at IS '撤回時間';
COMMENT ON COLUMN dms_doc_ver.ddv_cancel_by IS '撤回人員帳號';
COMMENT ON COLUMN dms_doc_ver.ddv_cancel_reason IS '撤回原因';
COMMENT ON COLUMN dms_doc_ver.ddv_crtby IS '建立者帳號';
COMMENT ON COLUMN dms_doc_ver.ddv_crtat IS '建立時間';
COMMENT ON COLUMN dms_doc_ver.ddv_updby IS '最後異動者帳號';
COMMENT ON COLUMN dms_doc_ver.ddv_updat IS '最後異動時間';

-- ============================================================================
-- dms_ver_rev
-- ============================================================================

CREATE TABLE dms_ver_rev (
    dvr_id SERIAL PRIMARY KEY,
    ddv_id INTEGER NOT NULL,
    dvr_base_ddv_id INTEGER,
    dfi_id INTEGER NOT NULL,
    dvr_note TEXT,
    dvr_dc VARCHAR(1) NOT NULL DEFAULT 'N',
    dvr_crtby VARCHAR(50) NOT NULL,
    dvr_crtat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dvr_dcby VARCHAR(50),
    dvr_dcat TIMESTAMP
);

CREATE UNIQUE INDEX uq_dms_ver_rev_current
ON dms_ver_rev(ddv_id)
WHERE dvr_dc = 'N';

CREATE INDEX idx_dms_ver_rev_file
ON dms_ver_rev(dfi_id);

COMMENT ON TABLE dms_ver_rev IS '版本修訂對照表';
COMMENT ON COLUMN dms_ver_rev.dvr_id IS '修訂對照表唯一識別碼';
COMMENT ON COLUMN dms_ver_rev.ddv_id IS '本次文件版本 ID';
COMMENT ON COLUMN dms_ver_rev.dvr_base_ddv_id IS '比較基準版本 ID';
COMMENT ON COLUMN dms_ver_rev.dfi_id IS '修訂對照表檔案 ID';
COMMENT ON COLUMN dms_ver_rev.dvr_note IS '備註';
COMMENT ON COLUMN dms_ver_rev.dvr_dc IS '作廢註記，Y：作廢，N：有效';
COMMENT ON COLUMN dms_ver_rev.dvr_crtby IS '建立者帳號';
COMMENT ON COLUMN dms_ver_rev.dvr_crtat IS '建立時間';
COMMENT ON COLUMN dms_ver_rev.dvr_dcby IS '作廢者帳號';
COMMENT ON COLUMN dms_ver_rev.dvr_dcat IS '作廢時間';

-- ============================================================================
-- dms_log
-- ============================================================================

CREATE TABLE dms_log (
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

CREATE INDEX idx_dms_log_event_at
ON dms_log(dl_event_at);

CREATE INDEX idx_dms_log_actor
ON dms_log(dl_actor_uid, dl_event_at);

CREATE INDEX idx_dms_log_action
ON dms_log(dl_action, dl_event_at);

CREATE INDEX idx_dms_log_result
ON dms_log(dl_result, dl_event_at);

CREATE INDEX idx_dms_log_folder
ON dms_log(df_fid, dl_event_at);

CREATE INDEX idx_dms_log_document
ON dms_log(dd_id, dl_event_at);

CREATE INDEX idx_dms_log_version
ON dms_log(ddv_id, dl_event_at);

CREATE INDEX idx_dms_log_managed_folder
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

-- ============================================================================
-- dms_purge_job
-- ============================================================================

CREATE TABLE dms_purge_job (
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

CREATE INDEX idx_dms_purge_job_status
ON dms_purge_job(dpj_status, dpj_requested_at);

CREATE INDEX idx_dms_purge_job_folder
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

-- ============================================================================
-- dms_ann
-- ============================================================================

CREATE TABLE dms_ann (
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

CREATE INDEX idx_dms_ann_status_time
ON dms_ann(dan_status, dan_pub_at, dan_exp_at);

CREATE INDEX idx_dms_ann_updat
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

-- ============================================================================
-- dms_ann_read
-- ============================================================================

CREATE TABLE dms_ann_read (
    danr_id SERIAL NOT NULL,
    dan_id INTEGER NOT NULL,
    danr_rev INTEGER NOT NULL,
    danr_uid VARCHAR(50) NOT NULL,
    danr_read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dms_ann_read_ann
ON dms_ann_read(dan_id, danr_rev);

CREATE INDEX idx_dms_ann_read_uid
ON dms_ann_read(danr_uid, danr_read_at);

CREATE UNIQUE INDEX uidx_dms_ann_read_identity
ON dms_ann_read(dan_id, danr_rev, danr_uid);

COMMENT ON TABLE dms_ann_read IS '使用者公告已讀紀錄';
COMMENT ON COLUMN dms_ann_read.danr_id IS '已讀紀錄識別碼';
COMMENT ON COLUMN dms_ann_read.dan_id IS '公告識別碼';
COMMENT ON COLUMN dms_ann_read.danr_rev IS '使用者已讀的公告版次';
COMMENT ON COLUMN dms_ann_read.danr_uid IS '使用者帳號';
COMMENT ON COLUMN dms_ann_read.danr_read_at IS '已讀時間';

COMMIT;
