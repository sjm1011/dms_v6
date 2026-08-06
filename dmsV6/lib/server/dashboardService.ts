import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type {
  AnnouncementInput,
  AnnouncementManagementItem,
  DashboardAdminAlert,
  DashboardAnnouncement,
  DashboardData,
  DashboardDocumentItem,
  DashboardManagerSummary
} from '../../types';
import type { SessionUser } from '../session';
import { isPreviewableExt } from './fileStorage';
import { getStorageRoot } from './fileStorage';
import { writeAudit } from './auditService';
import { pool, query, withTransaction } from './db';
import { isAdmin } from './auth';

interface AnnouncementRow {
  total_count: string | number;
  unread_count: string | number;
  urgent_unread_count: string | number;
  announcement_id: number;
  title: string;
  body: string;
  priority: number;
  revision: number;
  published_at: string;
  expires_at: string | null;
  is_read: boolean;
}

interface DashboardDocumentRow {
  total_count: string | number;
  document_id: number;
  version_id: number;
  code: string | null;
  title: string;
  version: string | null;
  version_sequence: number;
  revision_date: string;
  effective_at: string;
  folder_id: number;
  folder_path: string;
  ext: string;
}

interface AnnouncementManagementRow {
  total_count: string | number;
  announcement_id: number;
  title: string;
  body: string;
  priority: number;
  status: number;
  display_status: AnnouncementManagementItem['display_status'];
  revision: number;
  audience_all: boolean;
  audience_admin: boolean;
  audience_manager: boolean;
  published_at: string | null;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
}

interface LockedAnnouncementRow {
  dan_id: number;
  dan_title: string;
  dan_body: string;
  dan_priority: number;
  dan_status: number;
  dan_rev: number;
  dan_aud_all: string;
  dan_aud_admin: string;
  dan_aud_mgr: string;
  dan_pub_at: string | null;
  dan_exp_at: string | null;
}

export interface AnnouncementMutationInput extends AnnouncementInput {
  announcement_id?: number;
  revision?: number;
  action?: 'update' | 'publish';
}

const toDashboardDocument = (row: DashboardDocumentRow): DashboardDocumentItem => ({
  document_id: String(row.document_id),
  version_id: String(row.version_id),
  code: row.code,
  title: row.title,
  version: row.version || '',
  version_sequence: Number(row.version_sequence),
  revision_date: row.revision_date,
  effective_at: row.effective_at,
  folder_id: String(row.folder_id),
  folder_path: row.folder_path,
  ext: row.ext,
  can_preview: isPreviewableExt(row.ext)
});

const toManagementItem = (row: AnnouncementManagementRow): AnnouncementManagementItem => ({
  announcement_id: String(row.announcement_id),
  title: row.title,
  body: row.body,
  priority: row.priority as 1 | 2 | 3,
  status: row.status as 0 | 1 | 2,
  display_status: row.display_status,
  revision: Number(row.revision),
  audience_all: row.audience_all,
  audience_admin: row.audience_admin,
  audience_manager: row.audience_manager,
  published_at: row.published_at,
  expires_at: row.expires_at,
  created_by: row.created_by,
  created_at: row.created_at,
  updated_by: row.updated_by,
  updated_at: row.updated_at
});

const hasCurrentManagerAssignment = async (user: SessionUser) => {
  const result = await query<{ assigned: boolean }>(
    `SELECT EXISTS (
        SELECT 1
          FROM dms_folder_managers m
          JOIN dms_folders f ON f.df_fid = m.df_fid
         WHERE m.usr_uid = $1
           AND m.dfm_type IN (1, 2)
           AND m.dfm_dc = 'N'
           AND f.df_status = 1
      ) AS assigned`,
    [user.id.toUpperCase()]
  );

  return Boolean(result.rows[0]?.assigned);
};

const listVisibleAnnouncements = async (
  user: SessionUser,
  hasManagerAssignment: boolean
) => {
  const result = await query<AnnouncementRow>(
    `WITH eligible AS (
        SELECT a.dan_id,
               a.dan_title,
               a.dan_body,
               a.dan_priority,
               a.dan_rev,
               a.dan_pub_at,
               a.dan_exp_at,
               (r.danr_id IS NOT NULL) AS is_read
          FROM dms_ann a
          LEFT JOIN dms_ann_read r ON r.dan_id = a.dan_id
                                  AND r.danr_rev = a.dan_rev
                                  AND r.danr_uid = $1
         WHERE a.dan_status = 1
           AND a.dan_pub_at IS NOT NULL
           AND a.dan_pub_at <= CURRENT_TIMESTAMP
           AND (a.dan_exp_at IS NULL OR CURRENT_TIMESTAMP < a.dan_exp_at)
           AND (
                a.dan_aud_all = 'Y'
                OR ($2 = 'ADMIN' AND a.dan_aud_admin = 'Y')
                OR ($3 = true AND a.dan_aud_mgr = 'Y')
           )
      )
      SELECT COUNT(*) OVER() AS total_count,
             COUNT(*) FILTER (WHERE is_read = false) OVER() AS unread_count,
             COUNT(*) FILTER (WHERE is_read = false AND dan_priority = 3) OVER() AS urgent_unread_count,
             dan_id AS announcement_id,
             dan_title AS title,
             dan_body AS body,
             dan_priority AS priority,
             dan_rev AS revision,
             dan_pub_at::text AS published_at,
             dan_exp_at::text AS expires_at,
             is_read
        FROM eligible
       ORDER BY dan_priority DESC,
                is_read,
                dan_pub_at DESC,
                dan_id DESC`,
    [user.id.toUpperCase(), user.role, hasManagerAssignment]
  );

  const first = result.rows[0];
  return {
    summary: {
      total: Number(first?.total_count || 0),
      unread: Number(first?.unread_count || 0),
      urgent_unread: Number(first?.urgent_unread_count || 0)
    },
    announcements: result.rows.map<DashboardAnnouncement>((row) => ({
      announcement_id: String(row.announcement_id),
      title: row.title,
      body: row.body,
      priority: row.priority as 1 | 2 | 3,
      revision: Number(row.revision),
      published_at: row.published_at,
      expires_at: row.expires_at,
      is_read: Boolean(row.is_read)
    }))
  };
};

const ACCESS_CTES = `WITH RECURSIVE folder_ancestors AS (
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
               fa.ancestor_fid AS source_fid,
               CASE WHEN af.df_access_type = 2 THEN 2 ELSE 3 END AS source_access_type
          FROM folder_ancestors fa
          JOIN dms_folders af ON af.df_fid = fa.ancestor_fid
         WHERE af.df_access_type <> 1
         ORDER BY fa.df_fid,
                  fa.depth DESC
      ),
      assigned_manageable AS (
        SELECT DISTINCT fa.df_fid
          FROM folder_ancestors fa
          JOIN dms_folder_managers m ON m.df_fid = fa.ancestor_fid
          JOIN dms_folders managed_root ON managed_root.df_fid = m.df_fid
         WHERE m.usr_uid = $1
           AND m.dfm_type IN (1, 2)
           AND m.dfm_dc = 'N'
           AND managed_root.df_status = 1
      ),
      manageable AS (
        SELECT f.df_fid
          FROM dms_folders f
         WHERE $3 = 'ADMIN'
        UNION
        SELECT df_fid
          FROM assigned_manageable
      ),
      visible AS (
        SELECT f.df_fid
          FROM dms_folders f
         WHERE f.df_status = 1
           AND (
                EXISTS (SELECT 1 FROM manageable mg WHERE mg.df_fid = f.df_fid)
                OR NOT EXISTS (SELECT 1 FROM access_sources src WHERE src.df_fid = f.df_fid)
                OR EXISTS (
                    SELECT 1
                      FROM dms_folder_acl a
                      JOIN access_sources src ON src.source_fid = a.df_fid
                                              AND src.df_fid = f.df_fid
                     WHERE a.dfa_dc = 'N'
                       AND src.source_access_type = 2
                       AND (
                            (a.dfa_type = 1 AND a.dfa_target = $2)
                            OR (a.dfa_type = 2 AND a.dfa_target = $1)
                       )
                )
           )
      ),
      folder_paths AS (
        SELECT fa.df_fid,
               STRING_AGG(ancestor.df_name, ' / ' ORDER BY fa.depth DESC) AS folder_path
          FROM folder_ancestors fa
          JOIN dms_folders ancestor ON ancestor.df_fid = fa.ancestor_fid
         GROUP BY fa.df_fid
      )`;

const listRecentDocuments = async (user: SessionUser) => {
  const result = await query<DashboardDocumentRow>(
    `${ACCESS_CTES},
      recent_documents AS (
        SELECT d.dd_id AS document_id,
               v.ddv_id AS version_id,
               d.dd_code AS code,
               d.dd_title AS title,
               v.ddv_no AS version,
               v.ddv_seq AS version_sequence,
               v.ddv_rev_date::text AS revision_date,
               v.ddv_eff_at::text AS effective_at,
               d.df_fid AS folder_id,
               COALESCE(fp.folder_path, '文件庫') AS folder_path,
               file.dfi_ext AS ext
          FROM dms_doc d
          JOIN dms_doc_ver v ON v.dd_id = d.dd_id
          JOIN dms_file file ON file.dfi_id = v.ddv_pub_dfi_id
          LEFT JOIN dms_doc parent ON parent.dd_id = d.dd_parent_id
          LEFT JOIN folder_paths fp ON fp.df_fid = d.df_fid
         WHERE d.dd_status = 1
           AND v.ddv_cancel_at IS NULL
           AND v.ddv_eff_at <= CURRENT_TIMESTAMP
           AND v.ddv_eff_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
           AND (v.ddv_eff_to IS NULL OR CURRENT_TIMESTAMP < v.ddv_eff_to)
           AND (
                COALESCE(parent.dd_security_level, d.dd_security_level) <> 3
                OR EXISTS (
                    SELECT 1
                      FROM assigned_manageable assigned
                     WHERE assigned.df_fid = d.df_fid
                )
           )
           AND (
                d.df_fid = 0
                OR EXISTS (SELECT 1 FROM visible vis WHERE vis.df_fid = d.df_fid)
           )
      )
      SELECT COUNT(*) OVER() AS total_count,
             document_id,
             version_id,
             code,
             title,
             version,
             version_sequence,
             revision_date,
             effective_at,
             folder_id,
             folder_path,
             ext
        FROM recent_documents
       ORDER BY effective_at DESC,
                document_id DESC
       LIMIT 10`,
    [user.id.toUpperCase(), user.dept_id || '', user.role]
  );

  return {
    total: Number(result.rows[0]?.total_count || 0),
    items: result.rows.map(toDashboardDocument)
  };
};

const listManagerScheduledDocuments = async (user: SessionUser): Promise<DashboardManagerSummary> => {
  const result = await query<DashboardDocumentRow>(
    `WITH RECURSIVE managed_folders AS (
        SELECT DISTINCT m.df_fid
          FROM dms_folder_managers m
          JOIN dms_folders f ON f.df_fid = m.df_fid
         WHERE m.usr_uid = $1
           AND m.dfm_type IN (1, 2)
           AND m.dfm_dc = 'N'
           AND f.df_status = 1
        UNION
        SELECT child.df_fid
          FROM dms_folders child
          JOIN managed_folders parent ON parent.df_fid = child.df_pid
         WHERE child.df_status = 1
      ),
      folder_ancestors AS (
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
      folder_paths AS (
        SELECT fa.df_fid,
               STRING_AGG(ancestor.df_name, ' / ' ORDER BY fa.depth DESC) AS folder_path
          FROM folder_ancestors fa
          JOIN dms_folders ancestor ON ancestor.df_fid = fa.ancestor_fid
         GROUP BY fa.df_fid
      ),
      scheduled_documents AS (
        SELECT d.dd_id AS document_id,
               v.ddv_id AS version_id,
               d.dd_code AS code,
               d.dd_title AS title,
               v.ddv_no AS version,
               v.ddv_seq AS version_sequence,
               v.ddv_rev_date::text AS revision_date,
               v.ddv_eff_at::text AS effective_at,
               d.df_fid AS folder_id,
               fp.folder_path,
               file.dfi_ext AS ext
          FROM managed_folders managed
          JOIN dms_doc d ON d.df_fid = managed.df_fid
          JOIN dms_doc_ver v ON v.dd_id = d.dd_id
          JOIN dms_file file ON file.dfi_id = v.ddv_pub_dfi_id
          JOIN folder_paths fp ON fp.df_fid = d.df_fid
         WHERE d.dd_status = 1
           AND v.ddv_cancel_at IS NULL
           AND v.ddv_eff_at > CURRENT_TIMESTAMP
           AND v.ddv_eff_at <= CURRENT_TIMESTAMP + INTERVAL '30 days'
      )
      SELECT COUNT(*) OVER() AS total_count,
             document_id,
             version_id,
             code,
             title,
             version,
             version_sequence,
             revision_date,
             effective_at,
             folder_id,
             folder_path,
             ext
        FROM scheduled_documents
       ORDER BY effective_at,
                document_id
       LIMIT 10`,
    [user.id.toUpperCase()]
  );

  return {
    total: Number(result.rows[0]?.total_count || 0),
    items: result.rows.map(toDashboardDocument)
  };
};

const getAdminAlerts = async (): Promise<DashboardAdminAlert[]> => {
  const alerts: DashboardAdminAlert[] = [];
  let databaseAvailable = true;

  try {
    await query('SELECT 1');
  } catch {
    databaseAvailable = false;
    alerts.push({
      id: 'database_connection',
      level: 'critical',
      title: '資料庫連線異常',
      message: '系統目前無法完成 PostgreSQL 連線檢查。',
      target: 'status'
    });
  }

  try {
    await access(getStorageRoot(), fsConstants.R_OK | fsConstants.W_OK);
  } catch {
    alerts.push({
      id: 'storage_access',
      level: 'critical',
      title: '文件儲存空間異常',
      message: '文件儲存空間目前無法正常讀寫。',
      target: 'status'
    });
  }

  const missingConfiguration = [
    !process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dms-next-dev-session-secret' ? 'Session 密鑰' : '',
    !process.env.DMS_STORAGE_ROOT?.trim() ? '儲存根目錄' : '',
    process.env.SESSION_COOKIE_SECURE !== 'true' ? '安全 Cookie' : '',
    !(process.env.DATABASE_URL || process.env.PGDATABASE) ? '資料庫設定' : ''
  ].filter(Boolean);

  if (missingConfiguration.length > 0) {
    alerts.push({
      id: 'configuration',
      level: 'warning',
      title: '必要設定需檢查',
      message: `${missingConfiguration.join('、')}尚未通過安全檢查。`,
      target: 'status'
    });
  }

  if (pool.waitingCount > 0) {
    alerts.push({
      id: 'database_pool_waiting',
      level: 'warning',
      title: '資料庫連線池等待',
      message: `目前有 ${pool.waitingCount} 個資料庫請求等待可用連線。`,
      target: 'status'
    });
  }

  if (databaseAvailable) {
    try {
      const jobs = await query<{ pending_jobs: string | number; failed_jobs: string | number }>(
        `SELECT COUNT(*) FILTER (
                  WHERE dpj_status IN ('PREPARING', 'CLEANUP_PENDING')
                ) AS pending_jobs,
                COUNT(*) FILTER (
                  WHERE dpj_status = 'FAILED'
                ) AS failed_jobs
           FROM dms_purge_job`
      );
      const pendingJobs = Number(jobs.rows[0]?.pending_jobs || 0);
      const failedJobs = Number(jobs.rows[0]?.failed_jobs || 0);

      if (failedJobs > 0) {
        alerts.push({
          id: 'failed_purge_jobs',
          level: 'critical',
          title: '檔案清理工作失敗',
          message: `目前有 ${failedJobs} 筆失敗工作需要處理。`,
          target: 'recycle'
        });
      }
      if (pendingJobs > 0) {
        alerts.push({
          id: 'pending_purge_jobs',
          level: 'warning',
          title: '檔案清理工作待處理',
          message: `目前有 ${pendingJobs} 筆工作尚未完成。`,
          target: 'recycle'
        });
      }
    } catch {
      alerts.push({
        id: 'purge_job_check',
        level: 'warning',
        title: '清理工作狀態無法確認',
        message: '系統目前無法取得檔案清理工作摘要。',
        target: 'recycle'
      });
    }
  }

  return alerts;
};

export const getDashboardData = async (user: SessionUser): Promise<DashboardData> => {
  const sectionErrors: DashboardData['section_errors'] = [];
  let hasManagerAssignment = false;

  try {
    hasManagerAssignment = await hasCurrentManagerAssignment(user);
  } catch {
    sectionErrors.push({ section: 'manager_summary', message: '無法確認目前的資料夾管理範圍。' });
  }

  const [announcementResult, recentResult, managerResult, adminResult] = await Promise.allSettled([
    listVisibleAnnouncements(user, hasManagerAssignment),
    listRecentDocuments(user),
    hasManagerAssignment ? listManagerScheduledDocuments(user) : Promise.resolve(null),
    isAdmin(user) ? getAdminAlerts() : Promise.resolve([])
  ] as const);

  const announcementData = announcementResult.status === 'fulfilled'
    ? announcementResult.value
    : { summary: { total: 0, unread: 0, urgent_unread: 0 }, announcements: [] };
  if (announcementResult.status === 'rejected') {
    sectionErrors.push({ section: 'announcements', message: '公告資料載入失敗，請稍後重新整理。' });
  }

  const recentDocuments = recentResult.status === 'fulfilled'
    ? recentResult.value
    : { total: 0, items: [] };
  if (recentResult.status === 'rejected') {
    sectionErrors.push({ section: 'recent_documents', message: '近期發佈的文件載入失敗，請稍後重新整理。' });
  }

  const managerSummary = managerResult.status === 'fulfilled'
    ? managerResult.value
    : null;
  if (managerResult.status === 'rejected') {
    sectionErrors.push({ section: 'manager_summary', message: '預約發佈提醒載入失敗，請稍後重新整理。' });
  }

  const adminAlerts = adminResult.status === 'fulfilled' ? adminResult.value : [];
  if (adminResult.status === 'rejected') {
    sectionErrors.push({ section: 'admin_alerts', message: '系統異常摘要載入失敗，請前往系統狀態檢查。' });
  }

  return {
    generated_at: new Date().toISOString(),
    announcement_summary: announcementData.summary,
    announcements: announcementData.announcements,
    recent_documents: recentDocuments,
    manager_summary: managerSummary,
    admin_alerts: adminAlerts,
    section_errors: sectionErrors
  };
};

export const markAnnouncementRead = async (
  user: SessionUser,
  announcementId: number,
  revision: number
) => {
  if (!Number.isSafeInteger(announcementId) || announcementId <= 0 || !Number.isSafeInteger(revision) || revision <= 0) {
    throw new Error('公告識別碼或版次格式錯誤。');
  }

  const result = await query<{ revision: number }>(
    `SELECT a.dan_rev AS revision
       FROM dms_ann a
      WHERE a.dan_id = $1
        AND a.dan_status = 1
        AND a.dan_pub_at IS NOT NULL
        AND a.dan_pub_at <= CURRENT_TIMESTAMP
        AND (a.dan_exp_at IS NULL OR CURRENT_TIMESTAMP < a.dan_exp_at)
        AND (
             a.dan_aud_all = 'Y'
             OR ($3 = 'ADMIN' AND a.dan_aud_admin = 'Y')
             OR (
                 a.dan_aud_mgr = 'Y'
                 AND EXISTS (
                   SELECT 1
                     FROM dms_folder_managers m
                     JOIN dms_folders f ON f.df_fid = m.df_fid
                    WHERE m.usr_uid = $2
                      AND m.dfm_type IN (1, 2)
                      AND m.dfm_dc = 'N'
                      AND f.df_status = 1
                 )
             )
        )`,
    [announcementId, user.id.toUpperCase(), user.role]
  );
  const row = result.rows[0];
  if (!row) throw new Error('無權存取此公告。');
  if (Number(row.revision) !== revision) throw new Error('公告版次已變更，請重新載入後再確認。');

  await query(
    `INSERT INTO dms_ann_read (
            dan_id,
            danr_rev,
            danr_uid,
            danr_read_at
     ) VALUES (
            $1,
            $2,
            $3,
            CURRENT_TIMESTAMP
     )
     ON CONFLICT (dan_id, danr_rev, danr_uid)
     DO UPDATE SET danr_read_at = EXCLUDED.danr_read_at`,
    [announcementId, revision, user.id.toUpperCase()]
  );
};

const normalizeDateTime = (value: string | null | undefined, label: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (Number.isNaN(new Date(normalized).getTime())) throw new Error(`${label}格式錯誤。`);
  return normalized;
};

const normalizeAnnouncementInput = (input: AnnouncementMutationInput) => {
  const title = String(input.title || '').trim();
  const body = String(input.body || '').trim();
  const priority = Number(input.priority);
  const audienceAll = Boolean(input.audience_all);
  const audienceAdmin = Boolean(input.audience_admin);
  const audienceManager = Boolean(input.audience_manager);
  const publishedAt = normalizeDateTime(input.published_at, '發佈時間');
  const expiresAt = normalizeDateTime(input.expires_at, '下架時間');

  if (!title) throw new Error('請輸入公告標題。');
  if (title.length > 120) throw new Error('公告標題不可超過 120 個字元。');
  if (!body) throw new Error('請輸入公告內容。');
  if (body.length > 2000) throw new Error('公告內容不可超過 2000 個字元。');
  if (![1, 2, 3].includes(priority)) throw new Error('公告重要程度格式錯誤。');
  if (audienceAll && (audienceAdmin || audienceManager)) {
    throw new Error('全體使用者不可與角色公告對象同時選取。');
  }
  if (!audienceAll && !audienceAdmin && !audienceManager) throw new Error('請至少選擇一種公告對象。');
  if (publishedAt && expiresAt && new Date(expiresAt).getTime() <= new Date(publishedAt).getTime()) {
    throw new Error('下架時間必須晚於發佈時間。');
  }

  return {
    title,
    body,
    priority,
    audienceAll: audienceAll ? 'Y' : 'N',
    audienceAdmin: audienceAdmin ? 'Y' : 'N',
    audienceManager: audienceManager ? 'Y' : 'N',
    publishedAt,
    expiresAt
  };
};

const announcementSnapshot = (row: LockedAnnouncementRow) => ({
  title: row.dan_title,
  body: row.dan_body,
  priority: row.dan_priority,
  status: row.dan_status,
  revision: row.dan_rev,
  audience_all: row.dan_aud_all,
  audience_admin: row.dan_aud_admin,
  audience_manager: row.dan_aud_mgr,
  published_at: row.dan_pub_at,
  expires_at: row.dan_exp_at
});

const selectLockedAnnouncement = async (client: PoolClient, announcementId: number) => {
  const result = await client.query<LockedAnnouncementRow>(
    `SELECT dan_id,
            dan_title,
            dan_body,
            dan_priority,
            dan_status,
            dan_rev,
            dan_aud_all,
            dan_aud_admin,
            dan_aud_mgr,
            dan_pub_at::text AS dan_pub_at,
            dan_exp_at::text AS dan_exp_at
       FROM dms_ann
      WHERE dan_id = $1
      FOR UPDATE`,
    [announcementId]
  );
  return result.rows[0] || null;
};

export const listAnnouncements = async (options: {
  status?: string;
  page?: number;
  pageSize?: number;
}) => {
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  const status = String(options.status || '').toUpperCase();
  const validStatuses = new Set(['', 'DRAFT', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'ARCHIVED']);
  if (!validStatuses.has(status)) throw new Error('公告狀態篩選值錯誤。');

  const result = await query<AnnouncementManagementRow>(
    `WITH announcements AS (
        SELECT a.dan_id AS announcement_id,
               a.dan_title AS title,
               a.dan_body AS body,
               a.dan_priority AS priority,
               a.dan_status AS status,
               CASE
                 WHEN a.dan_status = 0 THEN 'DRAFT'
                 WHEN a.dan_status = 2 THEN 'ARCHIVED'
                 WHEN a.dan_pub_at > CURRENT_TIMESTAMP THEN 'SCHEDULED'
                 WHEN a.dan_exp_at IS NOT NULL AND a.dan_exp_at <= CURRENT_TIMESTAMP THEN 'EXPIRED'
                 ELSE 'PUBLISHED'
               END AS display_status,
               a.dan_rev AS revision,
               (a.dan_aud_all = 'Y') AS audience_all,
               (a.dan_aud_admin = 'Y') AS audience_admin,
               (a.dan_aud_mgr = 'Y') AS audience_manager,
               a.dan_pub_at::text AS published_at,
               a.dan_exp_at::text AS expires_at,
               a.dan_crtby AS created_by,
               a.dan_crtat::text AS created_at,
               a.dan_updby AS updated_by,
               a.dan_updat::text AS updated_at
          FROM dms_ann a
      )
      SELECT COUNT(*) OVER() AS total_count,
             announcement_id,
             title,
             body,
             priority,
             status,
             display_status,
             revision,
             audience_all,
             audience_admin,
             audience_manager,
             published_at,
             expires_at,
             created_by,
             created_at,
             updated_by,
             updated_at
        FROM announcements
       WHERE $1 = '' OR display_status = $1
       ORDER BY COALESCE(updated_at, created_at) DESC,
                announcement_id DESC
       LIMIT $2
      OFFSET $3`,
    [status, pageSize, offset]
  );

  return {
    rows: result.rows.map(toManagementItem),
    total: Number(result.rows[0]?.total_count || 0),
    page,
    page_size: pageSize
  };
};

export const createAnnouncementDraft = async (
  user: SessionUser,
  input: AnnouncementMutationInput
) => {
  const normalized = normalizeAnnouncementInput(input);
  return await withTransaction(async (client) => {
    const result = await client.query<{ announcement_id: number }>(
      `INSERT INTO dms_ann (
              dan_title,
              dan_body,
              dan_priority,
              dan_status,
              dan_rev,
              dan_aud_all,
              dan_aud_admin,
              dan_aud_mgr,
              dan_pub_at,
              dan_exp_at,
              dan_crtby,
              dan_crtat
       ) VALUES (
              $1,
              $2,
              $3,
              0,
              1,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9,
              CURRENT_TIMESTAMP
       )
       RETURNING dan_id AS announcement_id`,
      [
        normalized.title,
        normalized.body,
        normalized.priority,
        normalized.audienceAll,
        normalized.audienceAdmin,
        normalized.audienceManager,
        normalized.publishedAt,
        normalized.expiresAt,
        user.id
      ]
    );
    const announcementId = result.rows[0].announcement_id;
    await writeAudit({
      user,
      action: 'ANNOUNCEMENT_CREATED',
      resourceType: 'ANNOUNCEMENT',
      resourceId: announcementId,
      afterData: {
        ...normalized,
        status: 0,
        revision: 1
      },
      metadata: { title: normalized.title },
      required: true
    }, client);
    return { announcement_id: String(announcementId), revision: 1 };
  });
};

export const updateAnnouncement = async (
  user: SessionUser,
  input: AnnouncementMutationInput
) => {
  const announcementId = Number(input.announcement_id);
  const expectedRevision = Number(input.revision);
  if (!Number.isSafeInteger(announcementId) || announcementId <= 0) throw new Error('公告識別碼格式錯誤。');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) throw new Error('公告版次格式錯誤。');
  const normalized = normalizeAnnouncementInput(input);

  return await withTransaction(async (client) => {
    const current = await selectLockedAnnouncement(client, announcementId);
    if (!current) throw new Error('指定公告不存在。');
    if (current.dan_status === 2) throw new Error('已封存公告不可修改。');
    if (current.dan_rev !== expectedRevision) throw new Error('公告版次已變更，請重新載入後再修改。');

    const isPublishing = input.action === 'publish' && current.dan_status === 0;
    const nextStatus = isPublishing ? 1 : current.dan_status;
    const nextRevision = current.dan_status === 1 ? current.dan_rev + 1 : current.dan_rev;
    const publishedAt = nextStatus === 1
      ? normalized.publishedAt || current.dan_pub_at || new Date().toISOString()
      : normalized.publishedAt;

    if (publishedAt && normalized.expiresAt
      && new Date(normalized.expiresAt).getTime() <= new Date(publishedAt).getTime()) {
      throw new Error('下架時間必須晚於發佈時間。');
    }

    await client.query(
      `UPDATE dms_ann
          SET dan_title = $2,
              dan_body = $3,
              dan_priority = $4,
              dan_status = $5,
              dan_rev = $6,
              dan_aud_all = $7,
              dan_aud_admin = $8,
              dan_aud_mgr = $9,
              dan_pub_at = $10,
              dan_exp_at = $11,
              dan_updby = $12,
              dan_updat = CURRENT_TIMESTAMP
        WHERE dan_id = $1`,
      [
        announcementId,
        normalized.title,
        normalized.body,
        normalized.priority,
        nextStatus,
        nextRevision,
        normalized.audienceAll,
        normalized.audienceAdmin,
        normalized.audienceManager,
        publishedAt,
        normalized.expiresAt,
        user.id
      ]
    );

    await writeAudit({
      user,
      action: isPublishing ? 'ANNOUNCEMENT_PUBLISHED' : 'ANNOUNCEMENT_UPDATED',
      resourceType: 'ANNOUNCEMENT',
      resourceId: announcementId,
      beforeData: announcementSnapshot(current),
      afterData: {
        title: normalized.title,
        body: normalized.body,
        priority: normalized.priority,
        status: nextStatus,
        revision: nextRevision,
        audience_all: normalized.audienceAll,
        audience_admin: normalized.audienceAdmin,
        audience_manager: normalized.audienceManager,
        published_at: publishedAt,
        expires_at: normalized.expiresAt
      },
      metadata: { title: normalized.title },
      required: true
    }, client);

    return { announcement_id: String(announcementId), revision: nextRevision };
  });
};

export const archiveAnnouncement = async (
  user: SessionUser,
  announcementId: number,
  expectedRevision: number
) => {
  if (!Number.isSafeInteger(announcementId) || announcementId <= 0) throw new Error('公告識別碼格式錯誤。');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) throw new Error('公告版次格式錯誤。');

  await withTransaction(async (client) => {
    const current = await selectLockedAnnouncement(client, announcementId);
    if (!current) throw new Error('指定公告不存在。');
    if (current.dan_status === 2) throw new Error('公告已封存。');
    if (current.dan_status !== 1) throw new Error('草稿公告必須先發佈才能封存。');
    if (current.dan_rev !== expectedRevision) throw new Error('公告版次已變更，請重新載入後再封存。');

    await client.query(
      `UPDATE dms_ann
          SET dan_status = 2,
              dan_updby = $2,
              dan_updat = CURRENT_TIMESTAMP
        WHERE dan_id = $1`,
      [announcementId, user.id]
    );
    await writeAudit({
      user,
      action: 'ANNOUNCEMENT_ARCHIVED',
      resourceType: 'ANNOUNCEMENT',
      resourceId: announcementId,
      beforeData: announcementSnapshot(current),
      afterData: { ...announcementSnapshot(current), status: 2 },
      metadata: { title: current.dan_title },
      required: true
    }, client);
  });
};
