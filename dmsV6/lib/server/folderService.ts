import type { PoolClient } from 'pg';
import type { Folder, FolderACL } from '../../types';
import type { SessionUser } from '../session';
import { isAdmin } from './auth';
import { query, withTransaction } from './db';
import { writeAudit } from './auditService';

interface FolderRow {
  id: number;
  parent_id: number | null;
  root_id: number;
  name: string;
  status: number;
  access_type: number;
  manager_ids: string | null;
  manager_names: string | null;
  child_folder_count: string | number;
  document_count: string | number;
  acl_summary: string | null;
}

const toFolder = (row: FolderRow): Folder => ({
  id: String(row.id),
  parent_id: row.parent_id === null ? null : String(row.parent_id),
  root_id: String(row.root_id),
  name: row.name,
  status: Number(row.status),
  managers: row.manager_ids ? row.manager_ids.split(',').filter(Boolean) : [],
  manager_names: row.manager_names || '',
  access_type: Number(row.access_type || 2),
  acl_summary: row.acl_summary || '',
  child_folder_count: Number(row.child_folder_count || 0),
  document_count: Number(row.document_count || 0)
});

export const canManageFolder = async (user: SessionUser, folderId: number) => {
  if (isAdmin(user)) {
    return true;
  }

  const result = await query<{ allowed: boolean }>(
    `WITH RECURSIVE ancestors AS (
        SELECT df_fid,
               df_pid
          FROM dms_folders
         WHERE df_fid = $1
        UNION ALL
        SELECT p.df_fid,
               p.df_pid
          FROM dms_folders p
          JOIN ancestors a ON a.df_pid = p.df_fid
      )
      SELECT EXISTS (
        SELECT 1
          FROM dms_folder_managers m
          JOIN ancestors a ON a.df_fid = m.df_fid
         WHERE UPPER(m.usr_uid) = UPPER($2)
           AND m.dfm_dc = 'N'
      ) AS allowed`,
    [folderId, user.id]
  );

  return Boolean(result.rows[0]?.allowed);
};

export const listFolders = async (user: SessionUser) => {
  const result = await query<FolderRow>(
    `WITH RECURSIVE manager_summary AS (
        SELECT m.df_fid,
               STRING_AGG(m.usr_uid, ',' ORDER BY m.usr_uid) AS manager_ids,
               STRING_AGG(COALESCE(e.emp_name, m.usr_uid), '、' ORDER BY m.usr_uid) AS manager_names
          FROM dms_folder_managers m
          LEFT JOIN employee e ON UPPER(e.emp_id) = UPPER(m.usr_uid)
         WHERE m.dfm_dc = 'N'
         GROUP BY m.df_fid
      ),
      folder_ancestors AS (
        SELECT f.df_fid,
               f.df_fid AS ancestor_fid,
               f.df_pid AS ancestor_pid
          FROM dms_folders f
        UNION ALL
        SELECT fa.df_fid,
               p.df_fid AS ancestor_fid,
               p.df_pid AS ancestor_pid
          FROM folder_ancestors fa
          JOIN dms_folders p ON p.df_fid = fa.ancestor_pid
      ),
      effective_manager_summary AS (
        SELECT inherited.df_fid,
               STRING_AGG(COALESCE(e.emp_name, inherited.usr_uid), '、' ORDER BY inherited.usr_uid) AS manager_names
          FROM (
                SELECT DISTINCT fa.df_fid,
                       m.usr_uid
                  FROM folder_ancestors fa
                  JOIN dms_folder_managers m ON m.df_fid = fa.ancestor_fid
                 WHERE m.dfm_dc = 'N'
               ) inherited
          LEFT JOIN employee e ON UPPER(e.emp_id) = UPPER(inherited.usr_uid)
         GROUP BY inherited.df_fid
      ),
      acl_summary AS (
        SELECT a.df_fid,
               STRING_AGG(COALESCE(d.dept_name, e.emp_name, a.dfa_target), '、' ORDER BY a.dfa_type, a.dfa_target) AS acl_summary
          FROM dms_folder_acl a
          LEFT JOIN department d ON a.dfa_type = 1 AND a.dfa_target = d.dept_id::text
          LEFT JOIN employee e ON a.dfa_type = 2 AND UPPER(a.dfa_target) = UPPER(e.emp_id)
         WHERE a.dfa_dc = 'N'
         GROUP BY a.df_fid
      ),
      visible AS (
        SELECT f.df_fid
          FROM dms_folders f
         WHERE $3 = 'ADMIN'
            OR f.df_access_type = 1
            OR EXISTS (
                WITH RECURSIVE ancestors AS (
                    SELECT f2.df_fid,
                           f2.df_pid
                      FROM dms_folders f2
                     WHERE f2.df_fid = f.df_fid
                    UNION ALL
                    SELECT p.df_fid,
                           p.df_pid
                      FROM dms_folders p
                      JOIN ancestors a ON a.df_pid = p.df_fid
                )
                SELECT 1
                  FROM dms_folder_managers m
                  JOIN ancestors a ON a.df_fid = m.df_fid
                 WHERE UPPER(m.usr_uid) = UPPER($1)
                   AND m.dfm_dc = 'N'
            )
            OR EXISTS (
                SELECT 1
                  FROM dms_folder_acl a
                 WHERE a.df_fid = f.df_fid
                   AND a.dfa_dc = 'N'
                   AND (
                        (a.dfa_type = 1 AND a.dfa_target = $2)
                        OR (a.dfa_type = 2 AND UPPER(a.dfa_target) = UPPER($1))
                   )
            )
      )
      SELECT f.df_fid AS id,
             f.df_pid AS parent_id,
             f.df_root_fid AS root_id,
             f.df_name AS name,
             f.df_status AS status,
             f.df_access_type AS access_type,
             ms.manager_ids,
             ems.manager_names,
             COALESCE(asu.acl_summary, '') AS acl_summary,
             (
               SELECT COUNT(*)
                 FROM dms_folders c
                WHERE c.df_pid = f.df_fid
                  AND c.df_status = 1
             ) AS child_folder_count,
             (
               SELECT COUNT(*)
                 FROM dms_doc d
                WHERE d.df_fid = f.df_fid
                  AND d.dd_status = 1
             ) AS document_count
        FROM dms_folders f
        JOIN visible v ON v.df_fid = f.df_fid
        LEFT JOIN manager_summary ms ON ms.df_fid = f.df_fid
        LEFT JOIN effective_manager_summary ems ON ems.df_fid = f.df_fid
        LEFT JOIN acl_summary asu ON asu.df_fid = f.df_fid
       WHERE f.df_status = 1
       ORDER BY f.df_pid NULLS FIRST,
                f.df_name`,
    [user.id, user.dept_id || '', user.role]
  );

  return result.rows.map(toFolder);
};

const requireFolderManage = async (user: SessionUser, folderId: number) => {
  if (!(await canManageFolder(user, folderId))) {
    throw new Error('沒有此資料夾的管理權限。');
  }
};

const replaceManagers = async (
  client: PoolClient,
  folderId: number,
  managers: string[] | undefined,
  user: SessionUser
) => {
  if (!managers) {
    return;
  }

  await client.query(
    `UPDATE dms_folder_managers
        SET dfm_dc = 'Y',
            dfm_dcby = $2,
            dfm_dcat = CURRENT_TIMESTAMP
      WHERE df_fid = $1
        AND dfm_dc = 'N'`,
    [folderId, user.id]
  );

  for (const manager of managers.map((value) => value.trim()).filter(Boolean)) {
    await client.query(
      `INSERT INTO dms_folder_managers (
             df_fid,
             usr_uid,
             dfm_crtby,
             dfm_crtat,
             dfm_dc
       ) VALUES (
             $1,
             $2,
             $3,
             CURRENT_TIMESTAMP,
             'N'
       )`,
      [folderId, manager, user.id]
    );
  }
};

export const createFolder = async (
  user: SessionUser,
  name: string,
  parentId?: number | null,
  managers?: string[]
) => {
  const trimmedName = String(name || '').trim();

  if (!trimmedName) {
    throw new Error('資料夾名稱不可空白。');
  }

  if (!parentId && !isAdmin(user)) {
    throw new Error('第一層資料夾僅限系統管理員建立。');
  }

  if (parentId) {
    await requireFolderManage(user, parentId);
  }

  return withTransaction(async (client) => {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO dms_folders (
             df_pid,
             df_root_fid,
             df_name,
             df_status,
             df_access_type,
             df_crtby,
             df_crtat
       ) VALUES (
             $1,
             0,
             $2,
             1,
             2,
             $3,
             CURRENT_TIMESTAMP
       )
       RETURNING df_fid AS id`,
      [parentId || null, trimmedName, user.id]
    );
    const folderId = inserted.rows[0].id;
    const rootId = parentId
      ? (
          await client.query<{ root_id: number }>(
            `SELECT df_root_fid AS root_id
               FROM dms_folders
              WHERE df_fid = $1`,
            [parentId]
          )
        ).rows[0].root_id
      : folderId;

    await client.query(
      `UPDATE dms_folders
          SET df_root_fid = $2
        WHERE df_fid = $1`,
      [folderId, rootId]
    );
    await replaceManagers(client, folderId, managers, user);
    await writeAudit(
      {
        user,
        action: 'FOLDER_CREATED',
        resourceType: 'FOLDER',
        folderId,
        managedFolderId: rootId,
        metadata: { name: trimmedName, parent_id: parentId || null }
      },
      client
    );

    return { id: String(folderId) };
  });
};

export const updateFolder = async (
  user: SessionUser,
  id: number,
  name: string,
  managers?: string[]
) => {
  const trimmedName = String(name || '').trim();

  if (!id || !trimmedName) {
    throw new Error('資料夾識別碼與名稱不可空白。');
  }

  await requireFolderManage(user, id);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE dms_folders
          SET df_name = $2,
              df_updby = $3,
              df_updat = CURRENT_TIMESTAMP
        WHERE df_fid = $1
          AND df_status = 1`,
      [id, trimmedName, user.id]
    );
    await replaceManagers(client, id, managers, user);
    await writeAudit(
      {
        user,
        action: 'FOLDER_UPDATED',
        resourceType: 'FOLDER',
        folderId: id,
        metadata: { name: trimmedName }
      },
      client
    );
  });
};

export const deleteEmptyFolder = async (user: SessionUser, id: number) => {
  await requireFolderManage(user, id);

  await withTransaction(async (client) => {
    const counts = await client.query<{ child_count: string; doc_count: string }>(
      `SELECT (
              SELECT COUNT(*)
                FROM dms_folders c
               WHERE c.df_pid = $1
                 AND c.df_status = 1
             ) AS child_count,
             (
              SELECT COUNT(*)
                FROM dms_doc d
               WHERE d.df_fid = $1
                 AND d.dd_status = 1
             ) AS doc_count`,
      [id]
    );
    const row = counts.rows[0];

    if (Number(row.child_count) > 0 || Number(row.doc_count) > 0) {
      throw new Error('資料夾底下仍有文件或子資料夾，不能刪除（作廢）。');
    }

    await client.query(
      `UPDATE dms_folders
          SET df_status = 0,
              df_updby = $2,
              df_updat = CURRENT_TIMESTAMP
        WHERE df_fid = $1`,
      [id, user.id]
    );
    await writeAudit(
      {
        user,
        action: 'FOLDER_DELETED',
        resourceType: 'FOLDER',
        folderId: id
      },
      client
    );
  });
};

export const archiveFolder = async (user: SessionUser, id: number) => {
  await requireFolderManage(user, id);

  await withTransaction(async (client) => {
    await client.query(
      `WITH RECURSIVE subtree AS (
          SELECT df_fid
            FROM dms_folders
           WHERE df_fid = $1
          UNION ALL
          SELECT c.df_fid
            FROM dms_folders c
            JOIN subtree s ON c.df_pid = s.df_fid
           WHERE c.df_status = 1
       )
       UPDATE dms_folders f
          SET df_status = 2,
              df_arcby = $2,
              df_arcat = CURRENT_TIMESTAMP
        WHERE f.df_fid IN (SELECT df_fid FROM subtree)`,
      [id, user.id]
    );
    await client.query(
      `WITH RECURSIVE subtree AS (
          SELECT df_fid
            FROM dms_folders
           WHERE df_fid = $1
          UNION ALL
          SELECT c.df_fid
            FROM dms_folders c
            JOIN subtree s ON c.df_pid = s.df_fid
       )
       UPDATE dms_doc d
          SET dd_status = 2,
              dd_obs_at = CURRENT_TIMESTAMP,
              dd_obs_by = $2,
              dd_obs_reason = '因所屬資料夾封存而自動廢止',
              dd_obs_src = 2,
              dd_updby = $2,
              dd_updat = CURRENT_TIMESTAMP
        WHERE d.df_fid IN (SELECT df_fid FROM subtree)
          AND d.dd_status = 1`,
      [id, user.id]
    );
    await writeAudit(
      {
        user,
        action: 'FOLDER_ARCHIVED',
        resourceType: 'FOLDER',
        folderId: id
      },
      client
    );
  });
};

export const getFolderAcl = async (user: SessionUser, folderId: number): Promise<FolderACL> => {
  await requireFolderManage(user, folderId);

  const folder = await query<{ access_type: number }>(
    `SELECT df_access_type AS access_type
       FROM dms_folders
      WHERE df_fid = $1`,
    [folderId]
  );
  const acl = await query<{ dfa_type: number; dfa_target: string }>(
    `SELECT dfa_type,
            dfa_target
       FROM dms_folder_acl
      WHERE df_fid = $1
        AND dfa_dc = 'N'
      ORDER BY dfa_type,
               dfa_target`,
    [folderId]
  );

  return {
    access_type: Number(folder.rows[0]?.access_type || 2),
    dept_ids: acl.rows.filter((row) => row.dfa_type === 1).map((row) => row.dfa_target),
    uids: acl.rows.filter((row) => row.dfa_type === 2).map((row) => row.dfa_target)
  };
};

export const updateFolderAcl = async (
  user: SessionUser,
  folderId: number,
  accessType: number,
  deptIds: string[],
  uids: string[]
) => {
  await requireFolderManage(user, folderId);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE dms_folders
          SET df_access_type = $2,
              df_updby = $3,
              df_updat = CURRENT_TIMESTAMP
        WHERE df_fid = $1`,
      [folderId, accessType === 1 ? 1 : 2, user.id]
    );
    await client.query(
      `UPDATE dms_folder_acl
          SET dfa_dc = 'Y',
              dfa_dcby = $2,
              dfa_dcat = CURRENT_TIMESTAMP
        WHERE df_fid = $1
          AND dfa_dc = 'N'`,
      [folderId, user.id]
    );

    for (const deptId of deptIds.map((value) => value.trim()).filter(Boolean)) {
      await client.query(
        `INSERT INTO dms_folder_acl (
               df_fid,
               dfa_type,
               dfa_target,
               dfa_crtby,
               dfa_crtat,
               dfa_dc
         ) VALUES (
               $1,
               1,
               $2,
               $3,
               CURRENT_TIMESTAMP,
               'N'
         )`,
        [folderId, deptId, user.id]
      );
    }

    for (const uid of uids.map((value) => value.trim()).filter(Boolean)) {
      await client.query(
        `INSERT INTO dms_folder_acl (
               df_fid,
               dfa_type,
               dfa_target,
               dfa_crtby,
               dfa_crtat,
               dfa_dc
         ) VALUES (
               $1,
               2,
               $2,
               $3,
               CURRENT_TIMESTAMP,
               'N'
         )`,
        [folderId, uid, user.id]
      );
    }

    await writeAudit(
      {
        user,
        action: 'FOLDER_ACL_UPDATED',
        resourceType: 'ACL',
        folderId,
        metadata: { access_type: accessType, dept_ids: deptIds, uids }
      },
      client
    );
  });
};
