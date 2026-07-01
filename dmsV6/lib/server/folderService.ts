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
  is_access_inherited: boolean;
  can_manage: boolean;
  manager_role: 'PRIMARY' | 'CO_MANAGER' | null;
  can_assign_co_managers: boolean;
  can_edit_primary_manager: boolean;
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
  can_manage: Boolean(row.can_manage),
  manager_role: row.manager_role,
  can_assign_co_managers: Boolean(row.can_assign_co_managers),
  can_edit_primary_manager: Boolean(row.can_edit_primary_manager),
  access_type: Number(row.access_type || 2),
  is_access_inherited: Boolean(row.is_access_inherited),
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
         WHERE m.usr_uid = $2
           AND m.dfm_dc = 'N'
      ) AS allowed`,
    [folderId, user.id.toUpperCase()]
  );

  return Boolean(result.rows[0]?.allowed);
};

export const canAssignFolderManagers = async (user: SessionUser, folderId: number) => {
  if (isAdmin(user)) {
    return true;
  }

  const result = await query<{ allowed: boolean }>(
    `SELECT EXISTS (
        SELECT 1
          FROM dms_folders f
          JOIN dms_folder_managers m ON m.df_fid = f.df_root_fid
         WHERE f.df_fid = $1
           AND m.usr_uid = $2
           AND m.dfm_type = 1
           AND m.dfm_dc = 'N'
      ) AS allowed`,
    [folderId, user.id.toUpperCase()]
  );

  return Boolean(result.rows[0]?.allowed);
};

export const listFolders = async (user: SessionUser) => {
  const result = await query<FolderRow>(
    `WITH RECURSIVE folder_ancestors AS (
        SELECT f.df_fid,
               f.df_fid AS ancestor_fid,
               f.df_pid AS ancestor_pid,
               0 AS depth
          FROM dms_folders f
        UNION ALL
        SELECT fa.df_fid,
               p.df_fid AS ancestor_fid,
               p.df_pid AS ancestor_pid,
               fa.depth + 1 AS depth
          FROM folder_ancestors fa
          JOIN dms_folders p ON p.df_fid = fa.ancestor_pid
      ),
      access_sources AS (
        SELECT DISTINCT ON (fa.df_fid)
               fa.df_fid,
               fa.ancestor_fid AS source_fid
          FROM folder_ancestors fa
          JOIN dms_folders af ON af.df_fid = fa.ancestor_fid
         WHERE af.df_access_type = 2
         ORDER BY fa.df_fid,
                  fa.depth DESC
      ),
      manageable AS (
        SELECT f.df_fid
          FROM dms_folders f
         WHERE $3 = 'ADMIN'
        UNION
        SELECT DISTINCT fa.df_fid
          FROM folder_ancestors fa
          JOIN dms_folder_managers m ON m.df_fid = fa.ancestor_fid
         WHERE m.usr_uid = $1
           AND m.dfm_dc = 'N'
      ),
      visible AS (
        SELECT f.df_fid
          FROM dms_folders f
         WHERE f.df_status = 1
           AND (
                EXISTS (
                  SELECT 1
                    FROM manageable mg
                   WHERE mg.df_fid = f.df_fid
                )
                OR NOT EXISTS (
                    SELECT 1
                      FROM access_sources src
                     WHERE src.df_fid = f.df_fid
                )
                OR EXISTS (
                    SELECT 1
                      FROM dms_folder_acl a
                      JOIN access_sources src ON src.source_fid = a.df_fid
                                             AND src.df_fid = f.df_fid
                     WHERE a.dfa_dc = 'N'
                       AND (
                            (a.dfa_type = 1 AND a.dfa_target = $2)
                            OR (a.dfa_type = 2 AND a.dfa_target = $1)
                       )
                )
           )
      ),
      acl_summary AS (
        SELECT src.df_fid,
               STRING_AGG(
                 COALESCE(
                   d.dept_name,
                   e.emp_name,
                   CASE
                     WHEN a.dfa_type = 1 THEN '未識別部門'
                     ELSE '未識別同仁'
                   END
                 ),
                 '、'
                 ORDER BY a.dfa_type,
                          a.dfa_target
               ) AS acl_summary
          FROM access_sources src
          JOIN visible v ON v.df_fid = src.df_fid
          JOIN dms_folder_acl a ON a.df_fid = src.source_fid
          LEFT JOIN department d ON a.dfa_type = 1 AND a.dfa_target = d.dept_id::text
          LEFT JOIN employee e ON a.dfa_type = 2 AND a.dfa_target = e.emp_id
         WHERE a.dfa_dc = 'N'
         GROUP BY src.df_fid
      ),
      child_counts AS (
        SELECT c.df_pid AS df_fid,
               COUNT(*) AS child_folder_count
          FROM dms_folders c
          JOIN visible v ON v.df_fid = c.df_pid
         WHERE c.df_status = 1
         GROUP BY c.df_pid
      ),
      document_counts AS (
        SELECT d.df_fid,
               COUNT(*) AS document_count
          FROM dms_doc d
          JOIN visible v ON v.df_fid = d.df_fid
         WHERE d.dd_status = 1
         GROUP BY d.df_fid
      )
      SELECT f.df_fid AS id,
             f.df_pid AS parent_id,
             f.df_root_fid AS root_id,
             f.df_name AS name,
             f.df_status AS status,
             CASE WHEN src.source_fid IS NULL THEN 1 ELSE 2 END AS access_type,
             (src.source_fid IS NOT NULL AND src.source_fid <> f.df_fid) AS is_access_inherited,
             EXISTS (
               SELECT 1
                 FROM manageable mg
                WHERE mg.df_fid = f.df_fid
             ) AS can_manage,
             CASE
               WHEN EXISTS (
                 SELECT 1
                   FROM folder_ancestors fa
                   JOIN dms_folder_managers m ON m.df_fid = fa.ancestor_fid
                  WHERE fa.df_fid = f.df_fid
                    AND m.usr_uid = $1
                    AND m.dfm_type = 1
                    AND m.dfm_dc = 'N'
               ) THEN 'PRIMARY'
               WHEN EXISTS (
                 SELECT 1
                   FROM folder_ancestors fa
                   JOIN dms_folder_managers m ON m.df_fid = fa.ancestor_fid
                  WHERE fa.df_fid = f.df_fid
                    AND m.usr_uid = $1
                    AND m.dfm_type = 2
                    AND m.dfm_dc = 'N'
               ) THEN 'CO_MANAGER'
               ELSE NULL
             END AS manager_role,
             ($3 = 'ADMIN' OR EXISTS (
               SELECT 1
                 FROM dms_folder_managers pm
                WHERE pm.df_fid = f.df_root_fid
                  AND pm.usr_uid = $1
                  AND pm.dfm_type = 1
                  AND pm.dfm_dc = 'N'
             )) AS can_assign_co_managers,
             ($3 = 'ADMIN' AND f.df_pid IS NULL) AS can_edit_primary_manager,
             COALESCE(asu.acl_summary, '') AS acl_summary,
             COALESCE(cc.child_folder_count, 0) AS child_folder_count,
             COALESCE(dc.document_count, 0) AS document_count
        FROM dms_folders f
        JOIN visible v ON v.df_fid = f.df_fid
        LEFT JOIN access_sources src ON src.df_fid = f.df_fid
        LEFT JOIN acl_summary asu ON asu.df_fid = f.df_fid
        LEFT JOIN child_counts cc ON cc.df_fid = f.df_fid
        LEFT JOIN document_counts dc ON dc.df_fid = f.df_fid
       ORDER BY f.df_pid NULLS FIRST,
                f.df_name`,
    [user.id.toUpperCase(), user.dept_id || '', user.role]
  );

  return result.rows.map(toFolder);
};

export const getFolderAccessStatus = async (
  user: SessionUser,
  folderId: number
): Promise<'allowed' | 'denied'> => {
  if (!Number.isSafeInteger(folderId) || folderId <= 0) {
    return 'denied';
  }

  const result = await query<{ exists: boolean; allowed: boolean }>(
    `WITH RECURSIVE ancestors AS (
        SELECT f.df_fid,
               f.df_pid,
               f.df_access_type,
               0 AS depth
          FROM dms_folders f
         WHERE f.df_fid = $1
           AND f.df_status = 1
        UNION ALL
        SELECT p.df_fid,
               p.df_pid,
               p.df_access_type,
               a.depth + 1 AS depth
          FROM dms_folders p
          JOIN ancestors a ON a.df_pid = p.df_fid
      ),
      access_source AS (
        SELECT a.df_fid AS source_fid
          FROM ancestors a
         WHERE a.df_access_type = 2
         ORDER BY a.depth DESC
         LIMIT 1
      )
      SELECT EXISTS (
               SELECT 1
                 FROM dms_folders f
                WHERE f.df_fid = $1
                  AND f.df_status = 1
             ) AS exists,
             ($4 = 'ADMIN'
              OR NOT EXISTS (SELECT 1 FROM access_source)
              OR EXISTS (
                   SELECT 1
                     FROM dms_folder_acl a
                     JOIN access_source src ON src.source_fid = a.df_fid
                    WHERE a.dfa_dc = 'N'
                      AND (
                           (a.dfa_type = 1 AND a.dfa_target = $3)
                           OR (a.dfa_type = 2 AND a.dfa_target = $2)
                      )
                 )
              OR EXISTS (
                   SELECT 1
                     FROM dms_folder_managers m
                     JOIN ancestors a ON a.df_fid = m.df_fid
                    WHERE m.usr_uid = $2
                      AND m.dfm_dc = 'N'
                 )) AS allowed`,
    [folderId, user.id.toUpperCase(), user.dept_id || '', user.role]
  );

  const status = result.rows[0];
  return status?.exists && status.allowed ? 'allowed' : 'denied';
};

export const getFolderManagerInfo = async (
  user: SessionUser,
  folderId: number,
  includeEmployeeIds: boolean,
  assignmentType: 'PRIMARY' | 'CO_MANAGER' = 'CO_MANAGER'
) => {
  if (!folderId) {
    throw new Error('資料夾識別碼不可空白。');
  }

  await requireFolderManage(user, folderId);

  const managerNames = await query<{ manager_type: number; name: string }>(
    `WITH RECURSIVE ancestors AS (
        SELECT df_fid,
               df_pid
          FROM dms_folders
         WHERE df_fid = $1
           AND df_status = 1
        UNION ALL
        SELECT p.df_fid,
               p.df_pid
          FROM dms_folders p
          JOIN ancestors a ON a.df_pid = p.df_fid
         WHERE p.df_status = 1
      ),
      effective_managers AS (
        SELECT DISTINCT m.dfm_type AS manager_type,
               m.usr_uid
          FROM dms_folder_managers m
          JOIN ancestors a ON a.df_fid = m.df_fid
         WHERE m.dfm_type IN (1, 2)
           AND m.dfm_dc = 'N'
      )
      SELECT m.manager_type,
             e.emp_name AS name
        FROM effective_managers m
        JOIN employee e ON e.emp_id = m.usr_uid
       WHERE COALESCE(TRIM(e.emp_name), '') <> ''
       ORDER BY m.manager_type,
                e.emp_name`,
    [folderId]
  );
  const names = managerNames.rows
    .filter((row) => Number(row.manager_type) === 1)
    .map((row) => row.name);
  const coManagerNames = managerNames.rows
    .filter((row) => Number(row.manager_type) === 2)
    .map((row) => row.name);

  if (!includeEmployeeIds) {
    return {
      names,
      co_manager_names: coManagerNames
    };
  }

  if (assignmentType === 'PRIMARY') {
    if (!isAdmin(user)) {
      throw new Error('只有系統管理員可以更換第一層資料夾管理員。');
    }
  } else if (!(await canAssignFolderManagers(user, folderId))) {
    throw new Error('協同管理員不得指派或撤銷其他管理員。');
  }

  const targetFolderId = assignmentType === 'PRIMARY'
    ? (
        await query<{ root_id: number }>(
          `SELECT df_root_fid AS root_id
             FROM dms_folders
            WHERE df_fid = $1`,
          [folderId]
        )
      ).rows[0]?.root_id
    : folderId;

  const managerIds = await query<{ employee_id: string }>(
    `SELECT m.usr_uid AS employee_id
       FROM dms_folder_managers m
      WHERE m.df_fid = $1
        AND m.dfm_type = $2
        AND m.dfm_dc = 'N'
      ORDER BY m.usr_uid`,
    [targetFolderId, assignmentType === 'PRIMARY' ? 1 : 2]
  );

  return {
    names,
    co_manager_names: coManagerNames,
    employee_ids: managerIds.rows.map((row) => row.employee_id)
  };
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
  user: SessionUser,
  managerType: 1 | 2
) => {
  if (!managers) {
    return;
  }

  const uniqueManagers = Array.from(
    new Map(
      managers
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => [value.toUpperCase(), value])
    ).values()
  );
  const employees = uniqueManagers.length > 0
    ? await client.query<{ employee_id: string }>(
        `SELECT emp_id AS employee_id
           FROM employee
          WHERE emp_id = ANY($1::text[])
            AND emp_incumbent = 0`,
        [uniqueManagers.map((manager) => manager.toUpperCase())]
      )
    : { rows: [] as { employee_id: string }[] };
  const resolvedManagers = employees.rows.map((row) => row.employee_id);

  if (resolvedManagers.length !== uniqueManagers.length) {
    throw new Error('管理員員工編號不存在或已非在職人員。');
  }

  await client.query(
    `UPDATE dms_folder_managers
        SET dfm_dc = 'Y',
            dfm_dcby = $2,
            dfm_dcat = CURRENT_TIMESTAMP
      WHERE df_fid = $1
        AND dfm_type = $3
        AND dfm_dc = 'N'`,
    [folderId, user.id, managerType]
  );

  if (resolvedManagers.length > 0) {
    await client.query(
      `INSERT INTO dms_folder_managers (
             df_fid,
             usr_uid,
             dfm_type,
             dfm_crtby,
             dfm_crtat,
             dfm_dc
       )
       SELECT $1,
              manager_uid,
              $2,
              $3,
              CURRENT_TIMESTAMP,
              'N'
         FROM UNNEST($4::text[]) AS manager_uid`,
      [folderId, managerType, user.id, resolvedManagers]
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


  if (managers !== undefined) {
    throw new Error('建立資料夾時不得同時指派管理員，請進入第一層資料夾後另行設定。');
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
  name: string
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

export const updateFolderManagers = async (
  user: SessionUser,
  folderId: number,
  assignmentType: 'PRIMARY' | 'CO_MANAGER',
  managers: string[]
) => {
  if (!folderId) {
    throw new Error('資料夾識別碼不可空白。');
  }

  await requireFolderManage(user, folderId);

  const folder = await query<{ parent_id: number | null; root_id: number }>(
    `SELECT df_pid AS parent_id,
            df_root_fid AS root_id
       FROM dms_folders
      WHERE df_fid = $1
        AND df_status = 1`,
    [folderId]
  );
  const target = folder.rows[0];

  if (!target) {
    throw new Error('找不到有效的資料夾。');
  }

  if (assignmentType === 'PRIMARY') {
    if (!isAdmin(user) || target.parent_id !== null) {
      throw new Error('只有系統管理員可以更換第一層資料夾管理員。');
    }
    if (managers.filter((value) => value.trim()).length > 1) {
      throw new Error('第一層資料夾最多只能指派一名資料夾管理員。');
    }
  } else if (!(await canAssignFolderManagers(user, folderId))) {
    throw new Error('協同管理員不得指派或撤銷其他管理員。');
  }

  await withTransaction(async (client) => {
    await replaceManagers(
      client,
      assignmentType === 'PRIMARY' ? target.root_id : folderId,
      managers,
      user,
      assignmentType === 'PRIMARY' ? 1 : 2
    );
    await writeAudit(
      {
        user,
        action: assignmentType === 'PRIMARY' ? 'FOLDER_MANAGER_UPDATED' : 'FOLDER_CO_MANAGER_UPDATED',
        resourceType: 'FOLDER',
        folderId,
        managedFolderId: target.root_id,
        metadata: { assignment_type: assignmentType, managers }
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

  const folder = await query<{ access_type: number; source_fid: number | null }>(
    `WITH RECURSIVE ancestors AS (
        SELECT f.df_fid,
               f.df_pid,
               f.df_access_type,
               0 AS depth
          FROM dms_folders f
         WHERE f.df_fid = $1
        UNION ALL
        SELECT p.df_fid,
               p.df_pid,
               p.df_access_type,
               a.depth + 1 AS depth
          FROM dms_folders p
          JOIN ancestors a ON a.df_pid = p.df_fid
      ),
      access_source AS (
        SELECT a.df_fid AS source_fid
          FROM ancestors a
         WHERE a.df_access_type = 2
         ORDER BY a.depth DESC
         LIMIT 1
      )
      SELECT CASE WHEN src.source_fid IS NULL THEN 1 ELSE 2 END AS access_type,
             src.source_fid
        FROM (SELECT 1) seed
        LEFT JOIN access_source src ON true`,
    [folderId]
  );
  const sourceFolderId = folder.rows[0]?.source_fid ?? null;
  const acl = await query<{ dfa_type: number; dfa_target: string }>(
    `SELECT dfa_type,
            dfa_target
       FROM dms_folder_acl
      WHERE df_fid = $1
        AND dfa_dc = 'N'
      ORDER BY dfa_type,
               dfa_target`,
    [sourceFolderId]
  );

  return {
    access_type: Number(folder.rows[0]?.access_type || 1),
    dept_ids: acl.rows.filter((row) => row.dfa_type === 1).map((row) => row.dfa_target),
    uids: acl.rows.filter((row) => row.dfa_type === 2).map((row) => row.dfa_target),
    is_inherited: sourceFolderId !== null && sourceFolderId !== folderId,
    inherited_from_folder_id: sourceFolderId !== null && sourceFolderId !== folderId
      ? String(sourceFolderId)
      : null
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
  const inherited = await query<{ inherited: boolean }>(
    `WITH RECURSIVE ancestors AS (
        SELECT f.df_pid AS df_fid
          FROM dms_folders f
         WHERE f.df_fid = $1
        UNION ALL
        SELECT p.df_pid AS df_fid
          FROM dms_folders p
          JOIN ancestors a ON a.df_fid = p.df_fid
         WHERE a.df_fid IS NOT NULL
      )
      SELECT EXISTS (
               SELECT 1
                 FROM ancestors a
                 JOIN dms_folders f ON f.df_fid = a.df_fid
                WHERE f.df_access_type = 2
             ) AS inherited`,
    [folderId]
  );

  if (inherited.rows[0]?.inherited) {
    throw new Error('此資料夾已繼承上層資料夾的限閱屬性，不得另行設定。');
  }

  const normalizedDeptIds = Array.from(
    new Set(deptIds.map((value) => value.trim()).filter(Boolean))
  );
  const normalizedUids = Array.from(
    new Map(
      uids
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => [value.toUpperCase(), value.toUpperCase()])
    ).values()
  );

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

    if (normalizedDeptIds.length > 0) {
      await client.query(
        `INSERT INTO dms_folder_acl (
               df_fid,
               dfa_type,
               dfa_target,
               dfa_crtby,
               dfa_crtat,
               dfa_dc
         )
         SELECT $1,
                1,
                dept_id,
                $2,
                CURRENT_TIMESTAMP,
                'N'
           FROM UNNEST($3::text[]) AS dept_id`,
        [folderId, user.id, normalizedDeptIds]
      );
    }

    if (normalizedUids.length > 0) {
      await client.query(
        `INSERT INTO dms_folder_acl (
               df_fid,
               dfa_type,
               dfa_target,
               dfa_crtby,
               dfa_crtat,
               dfa_dc
         )
         SELECT $1,
                2,
                employee_uid,
                $2,
                CURRENT_TIMESTAMP,
                'N'
           FROM UNNEST($3::text[]) AS employee_uid`,
        [folderId, user.id, normalizedUids]
      );
    }

    await writeAudit(
      {
        user,
        action: 'FOLDER_ACL_UPDATED',
        resourceType: 'ACL',
        folderId,
        metadata: { access_type: accessType, dept_ids: normalizedDeptIds, uids: normalizedUids }
      },
      client
    );
  });
};
