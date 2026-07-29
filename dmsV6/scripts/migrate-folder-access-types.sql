ALTER TABLE dms_folders
ALTER COLUMN df_access_type SET DEFAULT 3;

UPDATE dms_folders f
   SET df_access_type = 3
 WHERE f.df_access_type = 2
   AND NOT EXISTS (
         SELECT 1
           FROM dms_folder_acl a
           LEFT JOIN department d
             ON a.dfa_type = 1
            AND a.dfa_target = d.dept_id::text
           LEFT JOIN employee e
             ON a.dfa_type = 2
            AND a.dfa_target = e.emp_id
            AND e.emp_incumbent = 0
          WHERE a.df_fid = f.df_fid
            AND a.dfa_dc = 'N'
            AND (
                 (a.dfa_type = 1 AND d.dept_id IS NOT NULL)
                 OR (a.dfa_type = 2 AND e.emp_id IS NOT NULL)
            )
       );

COMMENT ON COLUMN dms_folders.df_access_type IS
'資料夾存取狀態。1: 公開, 2: 限閱, 3: 僅限管理者';
