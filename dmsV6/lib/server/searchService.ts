import type {
  Document,
  DocumentSearchResult,
  DocumentSecurityLevel,
  DocumentVersion,
  FolderManagerRole
} from '../../types';
import type { SessionUser } from '../session';
import { query } from './db';
import { getFileExt, isPdfExt, isPreviewableExt } from './fileStorage';

interface SearchRow {
  total_count: string | number;
  id: number;
  code: string | null;
  title: string;
  folder_id: number;
  security_level: DocumentSecurityLevel;
  folder_name: string;
  folder_path: string;
  parent_document_id: number | null;
  parent_code: string | null;
  parent_title: string | null;
  related_document_count: string | number;
  related_version_count: string | number;
  can_manage: boolean;
  manager_role: FolderManagerRole;
  ver_id: number;
  seq: number;
  ver_number: string | null;
  file_name: string;
  file_size: string | number;
  mime: string;
  ext: string;
  change_note: string;
  revision_date: string;
  effective_at: string;
  effective_until: string | null;
  created_by: string;
  created_at: string;
  status: DocumentVersion['status'];
  has_source_file: boolean;
}

const toVersion = (row: SearchRow): DocumentVersion => ({
  ver_id: String(row.ver_id),
  ver_number: row.ver_number || '',
  seq: Number(row.seq),
  file_name: row.file_name,
  file_size: Number(row.file_size || 0),
  mime: row.mime,
  ext: row.ext,
  change_note: row.change_note,
  revision_date: row.revision_date,
  effective_at: row.effective_at,
  effective_until: row.effective_until,
  status: row.status,
  created_by: row.created_by,
  created_at: row.created_at,
  has_source_file: row.has_source_file
});

const toDocument = (rows: SearchRow[]): Document => {
  const first = rows[0];
  const versions = rows.map(toVersion);
  const current = versions.find(version => version.status === 'Scheduled')
    || versions.find(version => version.status === 'Effective')
    || versions[0];

  return {
    id: String(first.id),
    code: first.code,
    title: first.title,
    status: 'Effective',
    folder_id: String(first.folder_id),
    security_level: first.security_level,
    folder_name: first.folder_name,
    folder_path: first.folder_path,
    parent_document_id: first.parent_document_id ? String(first.parent_document_id) : null,
    parent_code: first.parent_code,
    parent_title: first.parent_title,
    related_document_count: Number(first.related_document_count || 0),
    related_version_count: Number(first.related_version_count || 0),
    manager_role: first.manager_role,
    versions,
    ver_id: current?.ver_id,
    version: current?.ver_number,
    file_size: current?.file_size,
    mime: current?.mime,
    change_note: current?.change_note,
    revision_date: current?.revision_date,
    effective_at: current?.effective_at,
    can_manage: first.can_manage,
    is_pdf: current ? isPdfExt(current.ext || getFileExt(current.file_name || '')) : false,
    can_preview: current ? isPreviewableExt(current.ext || getFileExt(current.file_name || '')) : false,
    has_source_file: current?.has_source_file || false
  };
};

export const searchDocuments = async (
  user: SessionUser,
  options: {
    keyword: string;
    scope: 'current' | 'all';
    folderId: number;
    page: number;
    pageSize: number;
  }
): Promise<DocumentSearchResult> => {
  const keyword = options.keyword.trim();
  if (!keyword) {
    throw new Error('請輸入搜尋關鍵字。');
  }
  if (keyword.length > 100) {
    throw new Error('搜尋關鍵字不可超過 100 個字元。');
  }

  const page = Math.max(1, options.page);
  const pageSize = Math.min(100, Math.max(1, options.pageSize));
  const offset = (page - 1) * pageSize;
  const scopeAll = options.scope === 'all' || options.folderId === 0;
  const normalizedUid = user.id.toUpperCase();
  const normalizedKeyword = keyword.toLocaleLowerCase('zh-TW');
  const normalizedCode = keyword.toUpperCase();

  const result = await query<SearchRow>(
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
               fa.ancestor_fid AS source_fid,
               CASE
                 WHEN af.df_access_type = 2 THEN 2
                 ELSE 3
               END AS source_access_type
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
         WHERE m.usr_uid = $1
           AND m.dfm_type IN (1, 2)
           AND m.dfm_dc = 'N'
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
                       AND src.source_access_type = 2
                       AND (
                            (a.dfa_type = 1 AND a.dfa_target = $2)
                            OR (a.dfa_type = 2 AND a.dfa_target = $1)
                       )
                )
           )
      ),
      scope_tree AS (
        SELECT f.df_fid
          FROM dms_folders f
         WHERE $4 = false
           AND f.df_fid = $5
           AND f.df_status = 1
        UNION ALL
        SELECT child.df_fid
          FROM dms_folders child
          JOIN scope_tree parent ON parent.df_fid = child.df_pid
         WHERE child.df_status = 1
      ),
      folder_paths AS (
        SELECT fa.df_fid,
               STRING_AGG(ancestor.df_name, ' / ' ORDER BY fa.depth DESC) AS folder_path
          FROM folder_ancestors fa
          JOIN dms_folders ancestor ON ancestor.df_fid = fa.ancestor_fid
         GROUP BY fa.df_fid
      ),
      document_access AS (
        SELECT d.dd_id,
               d.df_fid,
               d.dd_code,
               d.dd_title,
               d.dd_parent_id,
               COALESCE(parent.dd_security_level, d.dd_security_level) AS security_level,
               parent.dd_code AS parent_code,
               parent.dd_title AS parent_title,
               (
                 SELECT COUNT(*)
                   FROM dms_doc child
                  WHERE child.dd_parent_id = d.dd_id
               ) AS related_document_count,
               (
                 SELECT COUNT(*)
                   FROM dms_doc child
                   JOIN dms_doc_ver child_version ON child_version.dd_id = child.dd_id
                  WHERE child.dd_parent_id = d.dd_id
               ) AS related_version_count,
               CASE
                 WHEN d.df_fid = 0 THEN $3 = 'ADMIN'
                 ELSE EXISTS (
                   SELECT 1
                     FROM manageable mg
                    WHERE mg.df_fid = d.df_fid
                 )
               END AS can_manage,
               CASE
                 WHEN d.df_fid = 0 THEN NULL
                 WHEN EXISTS (
                   SELECT 1
                     FROM folder_ancestors fa
                     JOIN dms_folder_managers m ON m.df_fid = fa.ancestor_fid
                    WHERE fa.df_fid = d.df_fid
                      AND m.usr_uid = $1
                      AND m.dfm_type = 1
                      AND m.dfm_dc = 'N'
                 ) THEN 'PRIMARY'
                 WHEN EXISTS (
                   SELECT 1
                     FROM folder_ancestors fa
                     JOIN dms_folder_managers m ON m.df_fid = fa.ancestor_fid
                    WHERE fa.df_fid = d.df_fid
                      AND m.usr_uid = $1
                      AND m.dfm_type = 2
                      AND m.dfm_dc = 'N'
                 ) THEN 'CO_MANAGER'
                 ELSE NULL
               END AS manager_role,
               COALESCE(folder.df_name, '文件庫') AS folder_name,
               COALESCE(fp.folder_path, '文件庫') AS folder_path
          FROM dms_doc d
          LEFT JOIN dms_doc parent ON parent.dd_id = d.dd_parent_id
          LEFT JOIN dms_folders folder ON folder.df_fid = d.df_fid
          LEFT JOIN folder_paths fp ON fp.df_fid = d.df_fid
         WHERE d.dd_status = 1
           AND (
                COALESCE(parent.dd_security_level, d.dd_security_level) <> 3
                OR EXISTS (
                    SELECT 1
                      FROM assigned_manageable assigned
                     WHERE assigned.df_fid = d.df_fid
                )
           )
           AND (
                (
                  d.df_fid = 0
                  AND ($4 = true OR $5 = 0)
                )
                OR EXISTS (
                  SELECT 1
                    FROM visible vis
                   WHERE vis.df_fid = d.df_fid
                     AND (
                          $4 = true
                          OR EXISTS (
                            SELECT 1
                              FROM scope_tree st
                             WHERE st.df_fid = d.df_fid
                          )
                     )
                )
           )
      ),
      searchable_versions AS (
        SELECT da.dd_id,
               v.ddv_id,
               v.ddv_seq,
               v.ddv_no,
               v.ddv_chg_note,
               v.ddv_rev_date,
               v.ddv_eff_at,
               v.ddv_eff_to,
               v.ddv_crtby,
               v.ddv_crtat,
               v.ddv_src_dfi_id,
               file.dfi_name,
               file.dfi_size,
               file.dfi_mime,
               file.dfi_ext,
               CASE
                 WHEN v.ddv_eff_at > CURRENT_TIMESTAMP THEN 'Scheduled'
                 ELSE 'Effective'
               END AS version_status
          FROM document_access da
          JOIN dms_doc_ver v ON v.dd_id = da.dd_id
          JOIN dms_file file ON file.dfi_id = v.ddv_pub_dfi_id
         WHERE v.ddv_cancel_at IS NULL
           AND (
                (
                  v.ddv_eff_at <= CURRENT_TIMESTAMP
                  AND (v.ddv_eff_to IS NULL OR CURRENT_TIMESTAMP < v.ddv_eff_to)
                )
                OR (
                  da.can_manage = true
                  AND v.ddv_eff_at > CURRENT_TIMESTAMP
                )
           )
      ),
      matched_documents AS (
        SELECT da.*,
               CASE
                 WHEN UPPER(COALESCE(da.dd_code, '')) = $7 THEN 0
                 WHEN POSITION($6 IN LOWER(COALESCE(da.dd_code, ''))) > 0 THEN 1
                 WHEN POSITION($6 IN LOWER(da.dd_title)) > 0 THEN 2
                 ELSE 3
               END AS match_rank
          FROM document_access da
         WHERE POSITION($6 IN LOWER(COALESCE(da.dd_code, ''))) > 0
            OR POSITION($6 IN LOWER(da.dd_title)) > 0
            OR EXISTS (
              SELECT 1
                FROM searchable_versions sv
               WHERE sv.dd_id = da.dd_id
                 AND (
                      POSITION($6 IN LOWER(COALESCE(sv.ddv_no, ''))) > 0
                      OR POSITION($6 IN LOWER(COALESCE(sv.ddv_chg_note, ''))) > 0
                      OR POSITION($6 IN LOWER(sv.dfi_name)) > 0
                 )
            )
      ),
      paged_documents AS (
        SELECT md.*,
               COUNT(*) OVER() AS total_count
          FROM matched_documents md
         ORDER BY md.match_rank,
                  md.dd_code NULLS LAST,
                  md.dd_title,
                  md.dd_id
         LIMIT $8
        OFFSET $9
      )
      SELECT pd.total_count,
             pd.dd_id AS id,
             pd.dd_code AS code,
             pd.dd_title AS title,
             pd.df_fid AS folder_id,
             pd.security_level,
             pd.folder_name,
             pd.folder_path,
             pd.dd_parent_id AS parent_document_id,
             pd.parent_code,
             pd.parent_title,
             pd.related_document_count,
             pd.related_version_count,
             pd.can_manage,
             pd.manager_role,
             sv.ddv_id AS ver_id,
             sv.ddv_seq AS seq,
             sv.ddv_no AS ver_number,
             sv.dfi_name AS file_name,
             sv.dfi_size AS file_size,
             sv.dfi_mime AS mime,
             sv.dfi_ext AS ext,
             sv.ddv_chg_note AS change_note,
             sv.ddv_rev_date::text AS revision_date,
             sv.ddv_eff_at::text AS effective_at,
             sv.ddv_eff_to::text AS effective_until,
             sv.ddv_crtby AS created_by,
             sv.ddv_crtat::text AS created_at,
             sv.version_status AS status,
             (sv.ddv_src_dfi_id IS NOT NULL) AS has_source_file
        FROM paged_documents pd
        JOIN searchable_versions sv ON sv.dd_id = pd.dd_id
       ORDER BY pd.match_rank,
                pd.dd_code NULLS LAST,
                pd.dd_title,
                pd.dd_id,
                sv.ddv_eff_at DESC`,
    [
      normalizedUid,
      user.dept_id || '',
      user.role,
      scopeAll,
      options.folderId,
      normalizedKeyword,
      normalizedCode,
      pageSize,
      offset
    ]
  );

  const grouped = new Map<number, SearchRow[]>();
  result.rows.forEach(row => {
    const rows = grouped.get(row.id) || [];
    rows.push(row);
    grouped.set(row.id, rows);
  });

  return {
    documents: Array.from(grouped.values()).map(toDocument),
    total: Number(result.rows[0]?.total_count || 0),
    page,
    page_size: pageSize
  };
};
