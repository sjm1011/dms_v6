import { constants as fsConstants } from 'node:fs';
import { access, mkdir, realpath, rename, rm, statfs } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION_DATE } from '../appVersion';
import type { SessionUser } from '../session';
import { formatAuditActor, getAuditActionLabel, getAuditResourceLabel, getAuditResultLabel, getAuditRoleLabel } from '../auditLabels';
import { writeAudit } from './auditService';
import { pool, query, withTransaction } from './db';
import { getLegacyStorageRoot, getStorageRoot, resolveStoredPath } from './fileStorage';
import { isAdmin } from './auth';

export interface AuditFilters {
  dateFrom?: string;
  dateTo?: string;
  actor?: string;
  action?: string;
  result?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

interface PurgeManifestItem {
  fileId: number;
  originalPath: string;
  quarantinePath: string;
}

const normalizeDate = (value: string | undefined, endOfToday = false) => {
  if (!value) return null;
  const suffix = endOfToday ? 'T23:59:59.999' : 'T00:00:00.000';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}${suffix}` : value);
  if (Number.isNaN(date.getTime())) throw new Error('日期格式錯誤。');
  return date;
};

const managedFoldersCte = `managed_folders AS (
        SELECT f.df_fid
          FROM dms_folders f
          JOIN dms_folder_managers m ON m.df_fid = f.df_fid
         WHERE m.usr_uid = $1
           AND m.dfm_type IN (1, 2)
           AND m.dfm_dc = 'N'
           AND f.df_status = 1
        UNION
        SELECT child.df_fid
          FROM dms_folders child
          JOIN managed_folders parent ON child.df_pid = parent.df_fid
      )`;

const buildAuditWhere = (user: SessionUser, filters: AuditFilters) => {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    conditions.push(sql.replace('?', `$${params.length}`));
  };

  if (!isAdmin(user)) {
    params.push(user.id.toUpperCase());
    conditions.push(`l.dl_resource_type IN ('DOCUMENT', 'VERSION')`);
    conditions.push('l.df_fid IN (SELECT df_fid FROM managed_folders)');
  }

  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const dateFrom = normalizeDate(filters.dateFrom) || defaultFrom;
  const dateTo = normalizeDate(filters.dateTo, true) || new Date();
  if (dateFrom > dateTo) throw new Error('開始日期不可晚於結束日期。');

  add('l.dl_event_at >= ?', dateFrom);
  add('l.dl_event_at <= ?', dateTo);
  if (filters.actor?.trim()) {
    const actor = `%${filters.actor.trim()}%`;
    params.push(actor);
    const actorParam = `$${params.length}`;
    conditions.push(`(l.dl_actor_uid ILIKE ${actorParam} OR l.dl_actor_name ILIKE ${actorParam})`);
  }
  if (filters.action?.trim()) add('l.dl_action = ?', filters.action.trim());
  if (filters.result?.trim()) add('l.dl_result = ?', filters.result.trim());
  if (filters.keyword?.trim()) {
    const keyword = `%${filters.keyword.trim()}%`;
    params.push(keyword);
    const p = `$${params.length}`;
    conditions.push(`(l.dl_resource_type ILIKE ${p} OR l.dl_resource_id ILIKE ${p} OR l.dl_reason ILIKE ${p} OR l.dl_metadata::text ILIKE ${p})`);
  }

  return {
    cte: isAdmin(user) ? '' : managedFoldersCte,
    where: `WHERE ${conditions.join('\n         AND ')}`,
    params
  };
};

export const listAuditLogs = async (user: SessionUser, filters: AuditFilters, exportAll = false) => {
  const { cte, where, params } = buildAuditWhere(user, filters);
  const pageSize = exportAll ? 50_001 : Math.min(Math.max(Number(filters.pageSize) || 50, 1), 100);
  const page = exportAll ? 1 : Math.max(Number(filters.page) || 1, 1);
  const countResult = await query<{ total: string }>(
    `${cte ? `WITH RECURSIVE ${cte}` : ''}
      SELECT COUNT(*) AS total
        FROM dms_log l
        ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.total || 0);
  if (exportAll && total > 50_000) throw new Error('匯出資料超過 50,000 筆，請縮小查詢條件。');

  const dataParams = [...params, pageSize, (page - 1) * pageSize];
  const result = await query(
    `WITH RECURSIVE ${cte ? `${cte},` : ''}
      folder_paths AS (
        SELECT f.df_fid,
               f.df_pid,
               ('檔案庫 / ' || f.df_name)::text AS folder_path
          FROM dms_folders f
         WHERE f.df_pid IS NULL
        UNION ALL
        SELECT c.df_fid,
               c.df_pid,
               (p.folder_path || ' / ' || c.df_name)::text AS folder_path
          FROM dms_folders c
          JOIN folder_paths p ON p.df_fid = c.df_pid
      )
      SELECT l.dl_id::text AS id,
            l.dl_event_at::text AS event_at,
            l.dl_actor_uid AS actor_uid,
            l.dl_actor_name AS actor_name,
            l.dl_actor_role AS actor_role,
            l.dl_ip_address AS ip_address,
            l.dl_user_agent AS user_agent,
            l.dl_request_id AS request_id,
            l.dl_action AS action,
            l.dl_resource_type AS resource_type,
            l.dl_resource_id AS resource_id,
            l.dl_result AS result,
            l.dl_reason AS reason,
            l.dl_before_data AS before_data,
            l.dl_after_data AS after_data,
            l.dl_metadata AS metadata,
            l.df_fid::text AS folder_id,
            l.dd_id::text AS document_id,
            l.ddv_id::text AS version_id,
            CASE
              WHEN l.df_fid = 0 THEN '檔案庫'
              ELSE COALESCE(fp.folder_path, l.dl_metadata ->> 'name')
            END AS folder_name,
            COALESCE(vf.dfi_name, l.dl_metadata ->> 'file_name', d.dd_title) AS document_name,
            COALESCE(
              l.dl_metadata #>> '{audit_context,resource_location}',
              CASE
                WHEN l.dl_resource_type = 'AUTH' THEN 'DMS 登入介面'
                WHEN l.dl_resource_type = 'ADMIN' THEN '系統管理 / 系統設定'
                WHEN l.dl_resource_type = 'AUDIT' THEN '系統管理 / 系統稽核紀錄'
                WHEN l.df_fid = 0 THEN '檔案庫'
                ELSE fp.folder_path
              END,
              '系統'
            ) AS resource_location,
            COALESCE(
              l.dl_metadata #>> '{audit_context,target_type}',
              l.dl_resource_type
            ) AS target_type,
            COALESCE(
              l.dl_metadata #>> '{audit_context,target_name}',
              CASE
                WHEN l.dl_resource_type = 'AUTH' THEN 'DMS 文件管理系統'
                WHEN l.dl_resource_type = 'ADMIN' THEN CONCAT_WS(' ', COALESCE(l.dl_after_data ->> 'emp_name', l.dl_before_data ->> 'emp_name'), l.dl_resource_id)
                WHEN l.dl_resource_type = 'AUDIT' THEN '系統稽核紀錄'
                WHEN l.dl_resource_type = 'ACL' THEN COALESCE(f.df_name, l.dl_metadata ->> 'name', '資料夾') || '（存取權限）'
                WHEN l.dd_id IS NOT NULL THEN COALESCE(vf.dfi_name, l.dl_metadata ->> 'file_name', d.dd_title)
                WHEN l.df_fid IS NOT NULL THEN COALESCE(f.df_name, l.dl_metadata ->> 'name')
                ELSE l.dl_resource_id
              END,
              '系統資源'
            ) AS target_name,
            COALESCE(
              l.dl_metadata #>> '{audit_context,target_version}',
              v.ddv_no,
              l.dl_metadata ->> 'version'
            ) AS target_version
       FROM dms_log l
       LEFT JOIN folder_paths fp ON fp.df_fid = l.df_fid
       LEFT JOIN dms_folders f ON f.df_fid = l.df_fid
       LEFT JOIN dms_doc d ON d.dd_id = l.dd_id
       LEFT JOIN dms_doc_ver v ON v.ddv_id = l.ddv_id
       LEFT JOIN dms_file vf ON vf.dfi_id = v.ddv_pub_dfi_id
       ${where}
      ORDER BY l.dl_event_at DESC,
               l.dl_id DESC
      LIMIT $${params.length + 1}
     OFFSET $${params.length + 2}`,
    dataParams
  );
  const actions = exportAll
    ? []
    : (await query<{ action: string }>(
      `${cte ? `WITH RECURSIVE ${cte}` : ''}
       SELECT DISTINCT l.dl_action AS action
         FROM dms_log l
        ${isAdmin(user) ? '' : `WHERE l.dl_resource_type IN ('DOCUMENT', 'VERSION')
          AND l.df_fid IN (SELECT df_fid FROM managed_folders)`}
        ORDER BY l.dl_action`,
      isAdmin(user) ? [] : [user.id.toUpperCase()]
    )).rows.map(row => row.action);

  return { rows: result.rows, total, page, page_size: pageSize, actions };
};

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined
    ? ''
    : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export const exportAuditCsv = async (user: SessionUser, filters: AuditFilters) => {
  const data = await listAuditLogs(user, filters, true);
  const headers = ['事件時間', '操作者', '操作者角色', '稽核事件', '資源位置', '操作標的類型', '操作標的', '文件版本', '執行結果', '結果原因', '事件來源 IP', '用戶端識別資訊', '請求追蹤識別碼', '資源識別碼', '資料夾識別碼', '文件識別碼', '版本識別碼', '異動前', '異動後', '額外資料'];
  const lines = [headers.map(csvCell).join(',')];
  for (const row of data.rows as Record<string, unknown>[]) {
    lines.push([
      row.event_at, formatAuditActor(row.actor_name, row.actor_uid), getAuditRoleLabel(row.actor_role), getAuditActionLabel(row.action),
      row.resource_location, getAuditResourceLabel(row.target_type), row.target_name, row.target_version, getAuditResultLabel(row.result),
      row.reason, row.ip_address, row.user_agent, row.request_id, row.resource_id, row.folder_id, row.document_id,
      row.version_id, row.before_data, row.after_data, row.metadata
    ].map(csvCell).join(','));
  }
  await writeAudit({
    user,
    action: 'AUDIT_LOG_EXPORTED',
    resourceType: 'AUDIT',
    metadata: { filters, row_count: data.total },
    required: true
  });
  return `\uFEFF${lines.join('\r\n')}`;
};

export const listSystemAdmins = async () => {
  const result = await query(
    `SELECT a.emp_id,
            e.emp_name,
            COALESCE(d.dept_name, '') AS dept_name,
            a.da_crtby AS assigned_by,
            a.da_crtat::text AS assigned_at
       FROM dms_admins a
       JOIN employee e ON e.emp_id = a.emp_id
       LEFT JOIN department d ON d.dept_id = e.dept_id
      WHERE a.da_dc = 'N'
      ORDER BY a.da_crtat,
               a.emp_id`
  );
  return result.rows;
};

export const assignSystemAdmin = async (user: SessionUser, employeeId: string) => {
  const normalized = employeeId.trim().toUpperCase();
  if (!normalized) throw new Error('請輸入員工編號。');

  await withTransaction(async client => {
    const employee = await client.query<{ emp_id: string; emp_name: string }>(
      `SELECT emp_id,
              emp_name
         FROM employee
        WHERE emp_id = $1
          AND emp_incumbent = 0
        LIMIT 1`,
      [normalized]
    );
    if (!employee.rows[0]) throw new Error('查無此在職員工。');

    const active = await client.query('SELECT da_id FROM dms_admins WHERE emp_id = $1 AND da_dc = \'N\'', [normalized]);
    if (active.rowCount) throw new Error('此員工已是系統管理員。');

    const restored = await client.query(
      `UPDATE dms_admins
          SET da_crtby = $2,
              da_crtat = CURRENT_TIMESTAMP,
              da_dc = 'N',
              da_dcby = NULL,
              da_dcat = NULL
        WHERE da_id = (
              SELECT da_id
                FROM dms_admins
               WHERE emp_id = $1
                 AND da_dc = 'Y'
               ORDER BY da_dcat DESC NULLS LAST,
                        da_id DESC
               LIMIT 1
        )
      RETURNING da_id`,
      [normalized, user.id]
    );
    if (!restored.rowCount) {
      await client.query(
        `INSERT INTO dms_admins (emp_id, da_crtby, da_crtat, da_dc)
         VALUES ($1, $2, CURRENT_TIMESTAMP, 'N')`,
        [normalized, user.id]
      );
    }

    await writeAudit({
      user,
      action: 'SYSTEM_ADMIN_ASSIGNED',
      resourceType: 'ADMIN',
      resourceId: normalized,
      afterData: { emp_id: normalized, emp_name: employee.rows[0].emp_name },
      required: true
    }, client);
  });
};

export const revokeSystemAdmin = async (user: SessionUser, employeeId: string) => {
  const normalized = employeeId.trim().toUpperCase();
  if (normalized === user.id.toUpperCase()) throw new Error('不可撤銷自己的系統管理員權限。');

  await withTransaction(async client => {
    const active = await client.query<{ emp_id: string; emp_name: string }>(
      `SELECT a.emp_id,
              e.emp_name
         FROM dms_admins a
         JOIN employee e ON e.emp_id = a.emp_id
        WHERE a.emp_id = $1
          AND a.da_dc = 'N'
        FOR UPDATE OF a`,
      [normalized]
    );
    if (!active.rows[0]) throw new Error('此員工不是有效的系統管理員。');
    const count = await client.query<{ total: string }>('SELECT COUNT(*) AS total FROM dms_admins WHERE da_dc = \'N\'');
    if (Number(count.rows[0]?.total || 0) <= 1) throw new Error('不可撤銷最後 1 位系統管理員。');

    await client.query(
      `UPDATE dms_admins
          SET da_dc = 'Y',
              da_dcby = $2,
              da_dcat = CURRENT_TIMESTAMP
        WHERE emp_id = $1
          AND da_dc = 'N'`,
      [normalized, user.id]
    );
    await writeAudit({
      user,
      action: 'SYSTEM_ADMIN_REVOKED',
      resourceType: 'ADMIN',
      resourceId: normalized,
      beforeData: active.rows[0],
      required: true
    }, client);
  });
};

export const listPermissionOverview = async () => {
  const result = await query(
    `WITH manager_summary AS (
        SELECT m.df_fid,
               STRING_AGG(e.emp_name, '、' ORDER BY e.emp_name) FILTER (WHERE m.dfm_type = 1) AS primary_managers,
               STRING_AGG(e.emp_name, '、' ORDER BY e.emp_name) FILTER (WHERE m.dfm_type = 2) AS co_managers
          FROM dms_folder_managers m
          JOIN employee e ON e.emp_id = m.usr_uid
         WHERE m.dfm_dc = 'N'
         GROUP BY m.df_fid
      ),
      acl_summary AS (
        SELECT a.df_fid,
               STRING_AGG(COALESCE(d.dept_name, e.emp_name, a.dfa_target), '、' ORDER BY a.dfa_type, a.dfa_target) AS summary
          FROM dms_folder_acl a
          LEFT JOIN department d ON a.dfa_type = 1 AND a.dfa_target = d.dept_id::text
          LEFT JOIN employee e ON a.dfa_type = 2 AND a.dfa_target = e.emp_id
         WHERE a.dfa_dc = 'N'
         GROUP BY a.df_fid
      )
      SELECT f.df_fid::text AS folder_id,
             f.df_name AS folder_name,
             COALESCE(ms.primary_managers, '') AS primary_managers,
             COALESCE(ms.co_managers, '') AS co_managers,
             CASE WHEN f.df_access_type = 2 THEN 2 ELSE 1 END AS access_type,
             COALESCE(a.summary, '') AS acl_summary,
             (SELECT COUNT(*) FROM dms_folders c WHERE c.df_pid = f.df_fid AND c.df_status = 1)::int AS child_folder_count,
             (SELECT COUNT(*) FROM dms_doc doc WHERE doc.df_fid = f.df_fid AND doc.dd_status = 1)::int AS document_count
        FROM dms_folders f
        LEFT JOIN manager_summary ms ON ms.df_fid = f.df_fid
        LEFT JOIN acl_summary a ON a.df_fid = f.df_fid
       WHERE f.df_pid IS NULL
         AND f.df_status = 1
       ORDER BY f.df_name`
  );
  return result.rows;
};

const getStorageStatus = async () => {
  const root = getStorageRoot();
  try {
    await access(root, fsConstants.R_OK | fsConstants.W_OK);
    const info = await statfs(root);
    return {
      root,
      readable: true,
      writable: true,
      total_bytes: Number(info.blocks) * Number(info.bsize),
      free_bytes: Number(info.bavail) * Number(info.bsize)
    };
  } catch (error) {
    return { root, readable: false, writable: false, total_bytes: 0, free_bytes: 0, error: error instanceof Error ? error.message : String(error) };
  }
};

export const getSystemStatus = async () => {
  const started = performance.now();
  const db = await query<{ database_time: string; version: string }>(
    `SELECT CURRENT_TIMESTAMP::text AS database_time,
            current_setting('server_version') AS version`
  );
  const latency = Math.round((performance.now() - started) * 100) / 100;
  const counts = await query<Record<string, string>>(
    `SELECT (SELECT COUNT(*) FROM dms_folders WHERE df_status = 1) AS active_folders,
            (SELECT COUNT(*) FROM dms_folders WHERE df_status = 2) AS archived_folders,
            (SELECT COUNT(*) FROM dms_folders WHERE df_status = 0) AS deleted_folders,
            (SELECT COUNT(*) FROM dms_doc WHERE dd_status = 1) AS active_documents,
            (SELECT COUNT(*) FROM dms_doc WHERE dd_status = 2) AS obsolete_documents,
            (SELECT COUNT(*) FROM dms_doc_ver) AS versions,
            (SELECT COUNT(*) FROM dms_admins WHERE da_dc = 'N') AS admins,
            (SELECT COUNT(*) FROM dms_log) AS audit_logs,
            (SELECT COALESCE(SUM(dfi_size), 0) FROM dms_file WHERE dfi_status <> 0) AS registered_file_bytes,
            (SELECT COUNT(*) FROM dms_purge_job WHERE dpj_status IN ('PREPARING', 'CLEANUP_PENDING')) AS pending_purge_jobs,
            (SELECT COUNT(*) FROM dms_purge_job WHERE dpj_status = 'FAILED') AS failed_purge_jobs`
  );
  const numericCounts = Object.fromEntries(Object.entries(counts.rows[0] || {}).map(([key, value]) => [key, Number(value || 0)]));
  return {
    application: { version_date: APP_VERSION_DATE, environment: process.env.NODE_ENV || 'development', server_time: new Date().toISOString(), uptime_seconds: Math.floor(process.uptime()) },
    database: { connected: true, version: db.rows[0]?.version || '', database_time: db.rows[0]?.database_time || '', latency_ms: latency, pool_total: pool.totalCount, pool_idle: pool.idleCount, pool_waiting: pool.waitingCount },
    storage: await getStorageStatus(),
    configuration: {
      session_secret_secure: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'dms-next-dev-session-secret'),
      storage_root_configured: Boolean(process.env.DMS_STORAGE_ROOT?.trim()),
      secure_cookie: process.env.SESSION_COOKIE_SECURE === 'true',
      database_configured: Boolean(process.env.DATABASE_URL || process.env.PGDATABASE)
    },
    statistics: numericCounts
  };
};

export const listRecycleBatches = async () => {
  const batches = await query(
    `WITH RECURSIVE folder_paths AS (
        SELECT f.df_fid,
               f.df_pid,
               f.df_name::text AS folder_path
          FROM dms_folders f
         WHERE f.df_pid IS NULL
        UNION ALL
        SELECT c.df_fid,
               c.df_pid,
               (p.folder_path || ' / ' || c.df_name)::text
          FROM dms_folders c
          JOIN folder_paths p ON p.df_fid = c.df_pid
      ),
      roots AS (
        SELECT f.*
          FROM dms_folders f
          LEFT JOIN dms_folders p ON p.df_fid = f.df_pid
         WHERE f.df_status = 2
           AND (p.df_fid IS NULL OR p.df_status <> 2 OR p.df_arcat IS DISTINCT FROM f.df_arcat)
      ),
      batch_tree AS (
        SELECT r.df_fid AS batch_root,
               r.df_fid,
               r.df_arcat AS archive_at
          FROM roots r
        UNION ALL
        SELECT bt.batch_root,
               c.df_fid,
               bt.archive_at
          FROM batch_tree bt
          JOIN dms_folders c ON c.df_pid = bt.df_fid
                            AND c.df_status = 2
                            AND c.df_arcat = bt.archive_at
      ),
      batch_docs AS (
        SELECT bt.batch_root,
               d.dd_id
          FROM batch_tree bt
          JOIN dms_doc d ON d.df_fid = bt.df_fid
      ),
      batch_files AS (
        SELECT bd.batch_root, d.dfi_id AS file_id FROM batch_docs bd JOIN dms_doc d ON d.dd_id = bd.dd_id WHERE d.dfi_id IS NOT NULL
        UNION
        SELECT bd.batch_root, v.ddv_pub_dfi_id FROM batch_docs bd JOIN dms_doc_ver v ON v.dd_id = bd.dd_id
        UNION
        SELECT bd.batch_root, v.ddv_src_dfi_id FROM batch_docs bd JOIN dms_doc_ver v ON v.dd_id = bd.dd_id WHERE v.ddv_src_dfi_id IS NOT NULL
        UNION
        SELECT bd.batch_root, r.dfi_id FROM batch_docs bd JOIN dms_doc_ver v ON v.dd_id = bd.dd_id JOIN dms_ver_rev r ON r.ddv_id = v.ddv_id
      ),
      batch_file_stats AS (
        SELECT bf.batch_root,
               COUNT(*)::int AS file_count,
               COALESCE(SUM(f.dfi_size), 0)::bigint AS total_bytes
          FROM batch_files bf
          JOIN dms_file f ON f.dfi_id = bf.file_id
         GROUP BY bf.batch_root
      )
      SELECT r.df_fid::text AS folder_id,
             r.df_name AS folder_name,
             COALESCE(fp.folder_path, r.df_name) AS folder_path,
             r.df_arcby AS archived_by,
             r.df_arcat::text AS archived_at,
             (CURRENT_TIMESTAMP >= r.df_arcat + INTERVAL '90 days') AS can_purge,
             COUNT(DISTINCT bt.df_fid)::int - 1 AS child_folder_count,
             COUNT(DISTINCT bd.dd_id)::int AS document_count,
             COALESCE(bfs.file_count, 0) AS file_count,
             COALESCE(bfs.total_bytes, 0) AS total_bytes
        FROM roots r
        LEFT JOIN folder_paths fp ON fp.df_fid = r.df_fid
        LEFT JOIN batch_tree bt ON bt.batch_root = r.df_fid
        LEFT JOIN batch_docs bd ON bd.batch_root = r.df_fid
        LEFT JOIN batch_file_stats bfs ON bfs.batch_root = r.df_fid
       GROUP BY r.df_fid, r.df_name, fp.folder_path, r.df_arcby, r.df_arcat, bfs.file_count, bfs.total_bytes
       ORDER BY r.df_arcat DESC`
  );
  const jobs = await query(
    `SELECT dpj_id::text AS job_id,
            df_fid::text AS folder_id,
            dpj_status AS status,
            dpj_requested_by AS requested_by,
            dpj_requested_at::text AS requested_at,
            dpj_retry_count AS retry_count,
            dpj_error AS error
       FROM dms_purge_job
      WHERE dpj_status IN ('PREPARING', 'CLEANUP_PENDING', 'FAILED')
      ORDER BY dpj_requested_at DESC`
  );
  return { batches: batches.rows, jobs: jobs.rows };
};

export const restoreArchivedBatch = async (user: SessionUser, folderId: number) => {
  await withTransaction(async client => {
    const root = await client.query<{ archive_at: string; folder_name: string }>(
      `SELECT f.df_arcat::text AS archive_at,
              f.df_name AS folder_name
         FROM dms_folders f
        WHERE f.df_fid = $1
          AND f.df_status = 2
          AND NOT EXISTS (
              SELECT 1
                FROM dms_folders p
               WHERE p.df_fid = f.df_pid
                 AND p.df_status = 2
                 AND p.df_arcat = f.df_arcat
          )
        FOR UPDATE`,
      [folderId]
    );
    if (!root.rows[0]?.archive_at) throw new Error('找不到可還原的封存資料夾。');
    const archiveAt = root.rows[0].archive_at;

    await client.query(
      `WITH RECURSIVE batch_tree AS (
          SELECT df_fid FROM dms_folders WHERE df_fid = $1 AND df_status = 2 AND df_arcat = $2::timestamp
          UNION ALL
          SELECT c.df_fid FROM dms_folders c JOIN batch_tree bt ON c.df_pid = bt.df_fid WHERE c.df_status = 2 AND c.df_arcat = $2::timestamp
       )
       UPDATE dms_folders
          SET df_status = 1,
              df_arcby = NULL,
              df_arcat = NULL,
              df_updby = $3,
              df_updat = CURRENT_TIMESTAMP
        WHERE df_fid IN (SELECT df_fid FROM batch_tree)`,
      [folderId, archiveAt, user.id]
    );
    await client.query(
      `WITH RECURSIVE batch_tree AS (
          SELECT df_fid FROM dms_folders WHERE df_fid = $1
          UNION ALL SELECT c.df_fid FROM dms_folders c JOIN batch_tree bt ON c.df_pid = bt.df_fid
       )
       UPDATE dms_doc
          SET dd_status = 1,
              dd_obs_at = NULL,
              dd_obs_by = NULL,
              dd_obs_reason = NULL,
              dd_obs_src = NULL,
              dd_updby = $3,
              dd_updat = CURRENT_TIMESTAMP
        WHERE df_fid IN (SELECT df_fid FROM batch_tree)
          AND dd_status = 2
          AND dd_obs_src = 2
          AND dd_obs_at = $2::timestamp`,
      [folderId, archiveAt, user.id]
    );
    await writeAudit({ user, action: 'FOLDER_RESTORED', resourceType: 'FOLDER', resourceId: folderId, folderId, afterData: { status: 1, archive_at: archiveAt }, required: true }, client);
  });
};

const isInside = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};

const resolveAllowedFile = async (storedPath: string) => {
  const resolved = await realpath(await resolveStoredPath(storedPath));
  const configuredRoots = [getStorageRoot(), getLegacyStorageRoot()].filter(Boolean);
  for (const configuredRoot of configuredRoots) {
    try {
      const root = await realpath(configuredRoot);
      if (isInside(root, resolved)) return { resolved, root };
    } catch {
      // 無法解析的根目錄不可作為清理範圍。
    }
  }
  throw new Error('檔案路徑超出允許的儲存根目錄。');
};

const cleanupQuarantine = async (manifest: PurgeManifestItem[]) => {
  const roots = new Set<string>();
  for (const item of manifest) {
    const configuredRoots = [getStorageRoot(), getLegacyStorageRoot()].filter(Boolean).map(root => path.resolve(root));
    const allowed = configuredRoots.some(root => isInside(path.join(root, '.purge'), path.resolve(item.quarantinePath)));
    if (!allowed) throw new Error('隔離檔案路徑超出允許範圍。');
    await rm(item.quarantinePath, { force: true });
    roots.add(path.dirname(item.quarantinePath));
  }
  for (const root of roots) await rm(root, { recursive: true, force: true });
};

export const purgeArchivedBatch = async (user: SessionUser, folderId: number, confirmationName: string) => {
  const root = await query<{ folder_name: string; archive_at: string }>(
    `SELECT f.df_name AS folder_name,
            f.df_arcat::text AS archive_at
       FROM dms_folders f
      WHERE f.df_fid = $1
        AND f.df_status = 2
        AND CURRENT_TIMESTAMP >= f.df_arcat + INTERVAL '90 days'
        AND NOT EXISTS (
            SELECT 1
              FROM dms_folders p
             WHERE p.df_fid = f.df_pid
               AND p.df_status = 2
               AND p.df_arcat = f.df_arcat
        )`,
    [folderId]
  );
  if (!root.rows[0]) throw new Error('此資料夾尚未達永久刪除條件。');
  if (confirmationName !== root.rows[0].folder_name) throw new Error('輸入的資料夾名稱不正確。');

  const job = await query<{ job_id: number }>(
    `INSERT INTO dms_purge_job (df_fid, dpj_status, dpj_manifest, dpj_requested_by)
     VALUES ($1, 'PREPARING', '[]'::jsonb, $2)
     RETURNING dpj_id AS job_id`,
    [folderId, user.id]
  );
  const jobId = job.rows[0].job_id;
  const files = await query<{ file_id: number; stored_path: string }>(
    `WITH RECURSIVE batch_tree AS (
        SELECT df_fid FROM dms_folders WHERE df_fid = $1 AND df_status = 2 AND df_arcat = $2::timestamp
        UNION ALL
        SELECT c.df_fid FROM dms_folders c JOIN batch_tree bt ON c.df_pid = bt.df_fid WHERE c.df_status = 2 AND c.df_arcat = $2::timestamp
      ), batch_docs AS (
        SELECT dd_id, dfi_id FROM dms_doc WHERE df_fid IN (SELECT df_fid FROM batch_tree)
      ), file_ids AS (
        SELECT dfi_id AS file_id FROM batch_docs WHERE dfi_id IS NOT NULL
        UNION SELECT v.ddv_pub_dfi_id FROM dms_doc_ver v JOIN batch_docs d ON d.dd_id = v.dd_id
        UNION SELECT v.ddv_src_dfi_id FROM dms_doc_ver v JOIN batch_docs d ON d.dd_id = v.dd_id WHERE v.ddv_src_dfi_id IS NOT NULL
        UNION SELECT r.dfi_id FROM dms_ver_rev r JOIN dms_doc_ver v ON v.ddv_id = r.ddv_id JOIN batch_docs d ON d.dd_id = v.dd_id
      )
      SELECT f.dfi_id AS file_id,
             f.dfi_path AS stored_path
        FROM dms_file f
        JOIN file_ids ids ON ids.file_id = f.dfi_id
       WHERE f.dfi_status <> 0`,
    [folderId, root.rows[0].archive_at]
  );

  const manifest: PurgeManifestItem[] = [];
  try {
    for (const file of files.rows) {
      const allowed = await resolveAllowedFile(file.stored_path);
      manifest.push({ fileId: file.file_id, originalPath: allowed.resolved, quarantinePath: path.join(allowed.root, '.purge', String(jobId), `${file.file_id}_${path.basename(allowed.resolved)}`) });
    }
    await query('UPDATE dms_purge_job SET dpj_manifest = $2::jsonb WHERE dpj_id = $1', [jobId, JSON.stringify(manifest)]);
    const moved: PurgeManifestItem[] = [];
    try {
      for (const item of manifest) {
        await mkdir(path.dirname(item.quarantinePath), { recursive: true });
        await rename(item.originalPath, item.quarantinePath);
        moved.push(item);
      }
    } catch (error) {
      for (const item of moved.reverse()) {
        try { await mkdir(path.dirname(item.originalPath), { recursive: true }); await rename(item.quarantinePath, item.originalPath); } catch { /* 由工作錯誤供管理員追查。 */ }
      }
      throw error;
    }

    try {
      await withTransaction(async client => {
        await client.query(
          `WITH RECURSIVE batch_tree AS (
              SELECT df_fid FROM dms_folders WHERE df_fid = $1 AND df_status = 2 AND df_arcat = $2::timestamp
              UNION ALL SELECT c.df_fid FROM dms_folders c JOIN batch_tree bt ON c.df_pid = bt.df_fid WHERE c.df_status = 2 AND c.df_arcat = $2::timestamp
           )
           UPDATE dms_folders SET df_status = 0, df_updby = $3, df_updat = CURRENT_TIMESTAMP WHERE df_fid IN (SELECT df_fid FROM batch_tree)`,
          [folderId, root.rows[0].archive_at, user.id]
        );
        if (manifest.length) await client.query('UPDATE dms_file SET dfi_status = 0 WHERE dfi_id = ANY($1::int[])', [manifest.map(item => item.fileId)]);
        await client.query("UPDATE dms_purge_job SET dpj_status = 'CLEANUP_PENDING', dpj_error = NULL WHERE dpj_id = $1", [jobId]);
        await writeAudit({ user, action: 'FOLDER_PURGED', resourceType: 'FOLDER', resourceId: folderId, folderId, beforeData: { status: 2, archive_at: root.rows[0].archive_at }, afterData: { status: 0, purge_job_id: jobId }, required: true }, client);
      });
    } catch (error) {
      for (const item of [...manifest].reverse()) {
        try { await mkdir(path.dirname(item.originalPath), { recursive: true }); await rename(item.quarantinePath, item.originalPath); } catch { /* 由工作錯誤供管理員追查。 */ }
      }
      throw error;
    }

    try {
      await cleanupQuarantine(manifest);
      await query("UPDATE dms_purge_job SET dpj_status = 'COMPLETED', dpj_completed_at = CURRENT_TIMESTAMP, dpj_error = NULL WHERE dpj_id = $1", [jobId]);
    } catch (error) {
      await query("UPDATE dms_purge_job SET dpj_status = 'CLEANUP_PENDING', dpj_error = $2 WHERE dpj_id = $1", [jobId, error instanceof Error ? error.message : String(error)]);
    }
  } catch (error) {
    await query("UPDATE dms_purge_job SET dpj_status = 'FAILED', dpj_error = $2 WHERE dpj_id = $1", [jobId, error instanceof Error ? error.message : String(error)]);
    throw error;
  }
  return { job_id: String(jobId) };
};

export const retryPurgeCleanup = async (jobId: number) => {
  const result = await query<{ status: string; manifest: PurgeManifestItem[] }>(
    `SELECT dpj_status AS status,
            dpj_manifest AS manifest
       FROM dms_purge_job
      WHERE dpj_id = $1`,
    [jobId]
  );
  const row = result.rows[0];
  if (!row || row.status !== 'CLEANUP_PENDING') throw new Error('此工作目前不可重試清理。');
  try {
    await cleanupQuarantine(row.manifest || []);
    await query("UPDATE dms_purge_job SET dpj_status = 'COMPLETED', dpj_completed_at = CURRENT_TIMESTAMP, dpj_retry_count = dpj_retry_count + 1, dpj_error = NULL WHERE dpj_id = $1", [jobId]);
  } catch (error) {
    await query("UPDATE dms_purge_job SET dpj_retry_count = dpj_retry_count + 1, dpj_error = $2 WHERE dpj_id = $1", [jobId, error instanceof Error ? error.message : String(error)]);
    throw error;
  }
};
