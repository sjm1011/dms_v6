BEGIN;

ALTER TABLE dms_folder_managers
  ADD COLUMN IF NOT EXISTS dfm_type SMALLINT NOT NULL DEFAULT 2;

UPDATE dms_folder_managers m
   SET dfm_type = 1
  FROM dms_folders f
 WHERE f.df_fid = m.df_fid
   AND f.df_pid IS NULL
   AND f.df_status = 1
   AND m.dfm_dc = 'N';

DO $$
BEGIN
  IF EXISTS (
       SELECT 1
         FROM dms_folders f
         LEFT JOIN dms_folder_managers m
           ON m.df_fid = f.df_fid
          AND m.dfm_type = 1
          AND m.dfm_dc = 'N'
        WHERE f.df_pid IS NULL
          AND f.df_status = 1
        GROUP BY f.df_fid
       HAVING COUNT(m.dfm_id) > 1
     ) THEN
    RAISE EXCEPTION '每個有效第一層資料夾最多只能保留一名有效資料夾管理員，請先整理既有資料。';
  END IF;
END $$;

DROP INDEX IF EXISTS idx_dms_folder_mgr_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_folder_mgr_uniq
    ON dms_folder_managers(df_fid, usr_uid, dfm_type)
 WHERE dfm_dc = 'N';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_folder_primary_mgr_uniq
    ON dms_folder_managers(df_fid, dfm_type)
 WHERE dfm_dc = 'N'
   AND dfm_type = 1;

COMMENT ON COLUMN dms_folder_managers.dfm_type IS '管理身分類型。1：第一層資料夾管理員，2：協同管理員';

COMMIT;
