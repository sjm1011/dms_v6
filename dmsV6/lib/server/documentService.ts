import type { PoolClient } from 'pg';
import type { Document, DocumentVersion } from '../../types';
import type { SessionUser } from '../session';
import {
  getWindowsFileNameValidationError,
  sanitizeWindowsFileNamePart
} from '../documentFileName';
import { isAdmin } from './auth';
import { canManageFolder, getFolderAccessStatus } from './folderService';
import { query, withTransaction } from './db';
import { writeAudit } from './auditService';
import {
  buildContentDisposition,
  createFileStream,
  getFileExt,
  isPdfExt,
  isPreviewableExt,
  saveUploadedFile,
  type UploadPayload
} from './fileStorage';

interface VersionRow {
  ver_id: number;
  dd_id: number;
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
  cancel_reason: string | null;
  created_by: string;
  created_at: string;
  status: string;
  has_source_file: boolean;
}

interface DocumentRow extends VersionRow {
  id: number;
  code: string | null;
  title: string;
  doc_status: number;
  folder_id: number;
  parent_document_id: number | null;
  parent_code: string | null;
  parent_title: string | null;
  related_document_count: string | number;
  related_version_count: string | number;
  obsolete_at: string | null;
  obsolete_reason: string | null;
  can_manage: boolean;
}

interface FileRow {
  dd_id: number;
  df_fid: number;
  dd_code: string | null;
  dd_title: string;
  dd_status: number;
  ddv_id: number;
  ddv_seq: number;
  ddv_no: string | null;
  dfi_id: number;
  dfi_name: string;
  dfi_path: string;
  dfi_ext: string;
  dfi_mime: string;
  dfi_size: string | number;
}

const normalizeDocumentCode = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return value.trim().toUpperCase() || null;
};

const validateDocumentFileNamePart = (value: unknown) => {
  if (typeof value !== 'string') return;
  const error = getWindowsFileNameValidationError(value);
  if (error) throw new Error(error);
};

const validateDocumentCode = (code: string | null) => {
  if (code && code.length > 50) {
    throw new Error('文件編號不可超過 50 個字元。');
  }
};

const formatTaipeiDownloadDate = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
};

const buildDocumentDownloadFileName = (row: FileRow) => {
  const extension = sanitizeWindowsFileNamePart(row.dfi_ext.replace(/^\.+/, ''));
  const version = row.ddv_no?.trim() || `第${row.ddv_seq}版`;
  const segments = [
    row.dd_code?.trim() || '',
    row.dd_title.trim() || '文件',
    version,
    formatTaipeiDownloadDate()
  ]
    .filter(Boolean)
    .map((segment) => sanitizeWindowsFileNamePart(segment) || '文件');

  return `${segments.join('_')}${extension ? `.${extension}` : ''}`;
};

const ensureDocumentCodeAvailable = async (
  client: PoolClient,
  code: string | null,
  excludedDocumentId?: number
) => {
  if (!code) return;

  const duplicated = await client.query<{ id: number }>(
    `SELECT dd_id AS id
       FROM dms_doc
      WHERE dd_code = $1
        AND ($2::integer IS NULL OR dd_id <> $2)
      LIMIT 1`,
    [code, excludedDocumentId || null]
  );

  if (duplicated.rows[0]) {
    throw new Error('文件編號已存在。');
  }
};

const toVersionStatus = (row: VersionRow, docStatus: number): DocumentVersion['status'] => {
  if (docStatus === 2) {
    return 'Obsolete';
  }

  if (row.status === 'Cancelled') {
    return 'Cancelled';
  }

  if (row.status === 'Scheduled') {
    return 'Scheduled';
  }

  if (row.status === 'History') {
    return 'History';
  }

  return 'Effective';
};

const toVersion = (row: VersionRow, docStatus: number): DocumentVersion => ({
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
  status: toVersionStatus(row, docStatus),
  created_by: row.created_by,
  created_at: row.created_at,
  cancel_reason: row.cancel_reason || undefined,
  has_source_file: row.has_source_file
});

const toDocument = (rows: DocumentRow[]): Document => {
  const first = rows[0];
  const versions = rows.map((row) => toVersion(row, first.doc_status));
  const current = versions.find((version) => version.status === 'Effective') || versions[0];

  return {
    id: String(first.id),
    code: first.code,
    title: first.title,
    status: first.doc_status === 2 ? 'Obsolete' : 'Effective',
    folder_id: String(first.folder_id),
    parent_document_id: first.parent_document_id ? String(first.parent_document_id) : null,
    parent_code: first.parent_code,
    parent_title: first.parent_title,
    related_document_count: Number(first.related_document_count || 0),
    related_version_count: Number(first.related_version_count || 0),
    versions,
    ver_id: current?.ver_id,
    version: current?.ver_number,
    file_size: current?.file_size,
    mime: current?.mime,
    change_note: current?.change_note,
    revision_date: current?.revision_date,
    effective_at: current?.effective_at,
    obsolete_at: first.obsolete_at,
    obsolete_reason: first.obsolete_reason || undefined,
    can_manage: first.can_manage,
    is_pdf: current ? isPdfExt(current.ext || getFileExt(current.file_name || '')) : false,
    can_preview: current ? isPreviewableExt(current.ext || getFileExt(current.file_name || '')) : false,
    has_source_file: current?.has_source_file || false
  };
};

export const listDocuments = async (user: SessionUser, folderId: number) => {
  const canManage = folderId > 0 ? await canManageFolder(user, folderId) : isAdmin(user);
  const canAccess = folderId === 0
    || canManage
    || (await getFolderAccessStatus(user, folderId)) === 'allowed';
  const result = await query<DocumentRow>(
    `WITH visible_doc AS (
        SELECT d.dd_id
          FROM dms_doc d
          LEFT JOIN dms_folders f ON f.df_fid = d.df_fid
         WHERE d.df_fid = $1
           AND (
                $2 = true
                OR (
                    d.dd_status = 1
                    AND (
                         d.df_fid = 0
                         OR $3 = true
                    )
                )
           )
      ),
      related_counts AS (
        SELECT child.dd_parent_id AS dd_id,
               COUNT(DISTINCT child.dd_id) AS related_document_count,
               COUNT(version.ddv_id) AS related_version_count
          FROM dms_doc child
          LEFT JOIN dms_doc_ver version ON version.dd_id = child.dd_id
         WHERE child.dd_parent_id IS NOT NULL
         GROUP BY child.dd_parent_id
      )
      SELECT d.dd_id AS id,
             d.dd_code AS code,
             d.dd_title AS title,
             d.dd_status AS doc_status,
             d.df_fid AS folder_id,
             d.dd_parent_id AS parent_document_id,
             parent.dd_code AS parent_code,
             parent.dd_title AS parent_title,
             COALESCE(rc.related_document_count, 0) AS related_document_count,
             COALESCE(rc.related_version_count, 0) AS related_version_count,
             d.dd_obs_at AS obsolete_at,
             d.dd_obs_reason AS obsolete_reason,
             $2 AS can_manage,
             v.ddv_id AS ver_id,
             v.dd_id,
             v.ddv_seq AS seq,
             v.ddv_no AS ver_number,
             f.dfi_name AS file_name,
             f.dfi_size AS file_size,
             f.dfi_mime AS mime,
             f.dfi_ext AS ext,
             v.ddv_chg_note AS change_note,
             v.ddv_rev_date::text AS revision_date,
             v.ddv_eff_at::text AS effective_at,
             v.ddv_eff_to::text AS effective_until,
             v.ddv_cancel_reason AS cancel_reason,
             (v.ddv_src_dfi_id IS NOT NULL) AS has_source_file,
             v.ddv_crtby AS created_by,
             v.ddv_crtat::text AS created_at,
             CASE
               WHEN v.ddv_cancel_at IS NOT NULL THEN 'Cancelled'
               WHEN v.ddv_eff_at > CURRENT_TIMESTAMP THEN 'Scheduled'
               WHEN v.ddv_eff_to IS NOT NULL AND CURRENT_TIMESTAMP >= v.ddv_eff_to THEN 'History'
               ELSE 'Effective'
             END AS status
        FROM dms_doc d
        JOIN visible_doc vd ON vd.dd_id = d.dd_id
        JOIN dms_doc_ver v ON v.dd_id = d.dd_id
        JOIN dms_file f ON f.dfi_id = v.ddv_pub_dfi_id
        LEFT JOIN dms_doc parent ON parent.dd_id = d.dd_parent_id
        LEFT JOIN related_counts rc ON rc.dd_id = d.dd_id
       WHERE $2 = true
          OR (
              d.dd_status = 1
              AND v.ddv_cancel_at IS NULL
              AND v.ddv_eff_at <= CURRENT_TIMESTAMP
              AND (v.ddv_eff_to IS NULL OR CURRENT_TIMESTAMP < v.ddv_eff_to)
          )
       ORDER BY COALESCE(parent.dd_code, d.dd_code) NULLS LAST,
                COALESCE(parent.dd_title, d.dd_title),
                CASE WHEN d.dd_parent_id IS NULL THEN 0 ELSE 1 END,
                d.dd_code NULLS LAST,
                d.dd_title,
                d.dd_id,
                v.ddv_seq DESC`,
    [folderId, canManage, canAccess]
  );
  const grouped = new Map<number, DocumentRow[]>();

  result.rows.forEach((row) => {
    const rows = grouped.get(row.id) || [];
    rows.push(row);
    grouped.set(row.id, rows);
  });

  return Array.from(grouped.values()).map(toDocument);
};

const insertFile = async (
  client: PoolClient,
  file: UploadPayload,
  role: number,
  user: SessionUser
) => {
  const storedFile = await saveUploadedFile(file);
  const result = await client.query<{ id: number }>(
    `INSERT INTO dms_file (
           dfi_role,
           dfi_name,
           dfi_path,
           dfi_ext,
           dfi_mime,
           dfi_size,
           dfi_sha256,
           dfi_status,
           dfi_crtby,
           dfi_crtat
     ) VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           1,
           $8,
           CURRENT_TIMESTAMP
     )
     RETURNING dfi_id AS id`,
    [
      role,
      storedFile.name,
      storedFile.relativePath,
      storedFile.ext,
      storedFile.mime,
      storedFile.size,
      storedFile.sha256,
      user.id
    ]
  );

  return {
    id: result.rows[0].id,
    storedFile
  };
};

export const createDocument = async (
  user: SessionUser,
  payload: {
    folder_id: string;
    code: string;
    title: string;
    version: string;
    change_note: string;
    revision_date: string;
    effective_at: string;
    file: UploadPayload;
    source_file?: UploadPayload | null;
    parent_document_id?: string | number | null;
  }
) => {
  const parentDocumentId = payload.parent_document_id === null
    || payload.parent_document_id === undefined
    || payload.parent_document_id === ''
    ? null
    : Number(payload.parent_document_id);
  if (parentDocumentId !== null && (!Number.isInteger(parentDocumentId) || parentDocumentId <= 0)) {
    throw new Error('主文件識別碼格式錯誤。');
  }

  let folderId = Number(payload.folder_id || 0);
  if (parentDocumentId !== null) {
    const parent = await query<{
      df_fid: number;
      dd_parent_id: number | null;
      dd_status: number;
    }>(
      `SELECT df_fid,
              dd_parent_id,
              dd_status
         FROM dms_doc
        WHERE dd_id = $1`,
      [parentDocumentId]
    );
    const parentRow = parent.rows[0];
    if (!parentRow || parentRow.dd_status !== 1) {
      throw new Error('主文件不存在或已廢止。');
    }
    if (parentRow.dd_parent_id !== null) {
      throw new Error('相關文件底下不可再建立第 3 層文件。');
    }
    folderId = parentRow.df_fid;
  }
  validateDocumentFileNamePart(payload.code);
  validateDocumentFileNamePart(payload.title);
  validateDocumentFileNamePart(payload.version);
  const code = normalizeDocumentCode(payload.code);
  const title = payload.title?.trim();
  const versionNumber = payload.version?.trim() || null;
  validateDocumentCode(code);
  if (!title) throw new Error('文件名稱不可空白。');
  const canManage = folderId > 0 ? await canManageFolder(user, folderId) : isAdmin(user);

  if (!canManage) {
    throw new Error('沒有此資料夾的文件管理權限。');
  }

  return withTransaction(async (client) => {
    if (parentDocumentId !== null) {
      const parent = await client.query<{
        df_fid: number;
        dd_parent_id: number | null;
        dd_status: number;
      }>(
        `SELECT df_fid,
                dd_parent_id,
                dd_status
           FROM dms_doc
          WHERE dd_id = $1
          FOR UPDATE`,
        [parentDocumentId]
      );
      const parentRow = parent.rows[0];
      if (
        !parentRow
        || parentRow.dd_status !== 1
        || parentRow.dd_parent_id !== null
        || parentRow.df_fid !== folderId
      ) {
        throw new Error('主文件狀態或所在資料夾已變更，請重新整理後再試。');
      }
    }
    await ensureDocumentCodeAvailable(client, code);
    const published = await insertFile(client, payload.file, 1, user);
    const source =
      payload.source_file && isPdfExt(published.storedFile.ext)
        ? await insertFile(client, payload.source_file, 2, user)
        : null;
    const doc = await client.query<{ id: number }>(
      `INSERT INTO dms_doc (
             df_fid,
             dd_parent_id,
             dd_code,
             dd_title,
             dd_status,
             dd_crtby,
             dd_crtat
       ) VALUES (
             $1,
             $2,
             $3,
             $4,
             1,
             $5,
             CURRENT_TIMESTAMP
       )
       RETURNING dd_id AS id`,
      [folderId, parentDocumentId, code, title, user.id]
    );
    const docId = doc.rows[0].id;
    const version = await client.query<{ id: number }>(
      `INSERT INTO dms_doc_ver (
             dd_id,
             ddv_seq,
             ddv_no,
             ddv_rev_date,
             ddv_eff_at,
             ddv_chg_note,
             ddv_pub_dfi_id,
             ddv_src_dfi_id,
             ddv_crtby,
             ddv_crtat
       ) VALUES (
             $1,
             1,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7,
             $8,
             CURRENT_TIMESTAMP
       )
       RETURNING ddv_id AS id`,
      [
        docId,
        versionNumber,
        payload.revision_date,
        payload.effective_at,
        payload.change_note,
        published.id,
        source?.id || null,
        user.id
      ]
    );

    await writeAudit(
      {
        user,
        action: 'DOCUMENT_CREATED',
        resourceType: 'DOCUMENT',
        folderId,
        documentId: docId,
        versionId: version.rows[0].id,
        metadata: {
          code,
          title,
          file_name: payload.file.name,
          parent_document_id: parentDocumentId
        }
      },
      client
    );

    return { id: String(docId) };
  });
};

export const uploadVersion = async (
  user: SessionUser,
  payload: {
    doc_id: string;
    version: string;
    change_note: string;
    revision_date: string;
    effective_at: string;
    file: UploadPayload;
    source_file?: UploadPayload | null;
  }
) => {
  const docId = Number(payload.doc_id);
  validateDocumentFileNamePart(payload.version);
  const versionNumber = payload.version?.trim() || null;
  const doc = await query<{ df_fid: number; dd_status: number }>(
    `SELECT df_fid,
            dd_status
       FROM dms_doc
      WHERE dd_id = $1`,
    [docId]
  );
  const docRow = doc.rows[0];

  if (!docRow || docRow.dd_status !== 1) {
    throw new Error('文件不存在或已廢止。');
  }

  if (!(await canManageFolder(user, docRow.df_fid))) {
    throw new Error('沒有此文件的管理權限。');
  }

  await withTransaction(async (client) => {
    const latest = await client.query<{ seq: number; ver_id: number }>(
      `SELECT ddv_seq AS seq,
              ddv_id AS ver_id
         FROM dms_doc_ver
        WHERE dd_id = $1
          AND ddv_cancel_at IS NULL
        ORDER BY ddv_seq DESC
        LIMIT 1`,
      [docId]
    );
    const nextSeq = Number(latest.rows[0]?.seq || 0) + 1;
    const published = await insertFile(client, payload.file, 1, user);
    const source =
      payload.source_file && isPdfExt(published.storedFile.ext)
        ? await insertFile(client, payload.source_file, 2, user)
        : null;

    if (latest.rows[0]) {
      await client.query(
        `UPDATE dms_doc_ver
            SET ddv_eff_to = $2,
                ddv_updby = $3,
                ddv_updat = CURRENT_TIMESTAMP
          WHERE ddv_id = $1
            AND ddv_eff_to IS NULL`,
        [latest.rows[0].ver_id, payload.effective_at, user.id]
      );
    }

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO dms_doc_ver (
             dd_id,
             ddv_seq,
             ddv_no,
             ddv_rev_date,
             ddv_eff_at,
             ddv_chg_note,
             ddv_pub_dfi_id,
             ddv_src_dfi_id,
             ddv_crtby,
             ddv_crtat
       ) VALUES (
             $1,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7,
             $8,
             $9,
             CURRENT_TIMESTAMP
       )
       RETURNING ddv_id AS id`,
      [
        docId,
        nextSeq,
        versionNumber,
        payload.revision_date,
        payload.effective_at,
        payload.change_note,
        published.id,
        source?.id || null,
        user.id
      ]
    );

    await writeAudit(
      {
        user,
        action: 'DOCUMENT_VERSION_CREATED',
        resourceType: 'VERSION',
        folderId: docRow.df_fid,
        documentId: docId,
        versionId: inserted.rows[0].id,
        metadata: { file_name: payload.file.name }
      },
      client
    );
  });
};

export const editDocument = async (
  user: SessionUser,
  payload: {
    doc_id: string;
    version_id: string;
    code?: string;
    title: string;
    version: string;
    change_note: string;
    revision_date: string;
    effective_at: string;
    source_file?: UploadPayload | null;
  }
) => {
  const docId = Number(payload.doc_id);
  const versionId = Number(payload.version_id);
  const requestedCode = payload.code === undefined
    ? undefined
    : normalizeDocumentCode(payload.code);
  const title = payload.title?.trim();
  const versionNumber = payload.version?.trim() || null;
  const changeNote = payload.change_note?.trim();

  validateDocumentFileNamePart(payload.version);
  if (!payload.revision_date) throw new Error('修訂日期不可空白。');
  if (!payload.effective_at) throw new Error('生效日期不可空白。');
  if (!changeNote) throw new Error('異動說明不可空白。');

  const doc = await query<{ df_fid: number; dd_status: number }>(
    `SELECT df_fid,
            dd_status
       FROM dms_doc
      WHERE dd_id = $1`,
    [docId]
  );
  const docRow = doc.rows[0];

  if (!docRow || docRow.dd_status !== 1) {
    throw new Error('文件不存在或已廢止。');
  }

  if (!(await canManageFolder(user, docRow.df_fid))) {
    throw new Error('沒有此文件的管理權限。');
  }

  await withTransaction(async (client) => {
    const current = await client.query<{
      code: string | null;
      title: string;
      seq: number;
      version: string | null;
      revision_date: string;
      effective_at: string;
      change_note: string;
      source_file_id: number | null;
      published_ext: string;
      is_scheduled: boolean;
    }>(
      `SELECT d.dd_code AS code,
              d.dd_title AS title,
              v.ddv_seq AS seq,
              v.ddv_no AS version,
              v.ddv_rev_date::text AS revision_date,
              v.ddv_eff_at::text AS effective_at,
              v.ddv_chg_note AS change_note,
              v.ddv_src_dfi_id AS source_file_id,
              f.dfi_ext AS published_ext,
              (v.ddv_eff_at > CURRENT_TIMESTAMP) AS is_scheduled
         FROM dms_doc d
         JOIN dms_doc_ver v ON v.dd_id = d.dd_id
         JOIN dms_file f ON f.dfi_id = v.ddv_pub_dfi_id
        WHERE d.dd_id = $1
          AND v.ddv_id = $2
          AND v.ddv_cancel_at IS NULL
        FOR UPDATE OF d, v`,
      [docId, versionId]
    );
    const currentRow = current.rows[0];

    if (!currentRow) {
      throw new Error('指定的文件版本不存在或已撤回。');
    }

    if (!currentRow.is_scheduled) {
      validateDocumentFileNamePart(payload.code);
      validateDocumentFileNamePart(payload.title);
      if (requestedCode !== undefined) validateDocumentCode(requestedCode);
      if (!title) throw new Error('文件名稱不可空白。');
    }

    const updatedCode = currentRow.is_scheduled
      ? currentRow.code
      : requestedCode === undefined
        ? currentRow.code
        : requestedCode;
    const updatedTitle = currentRow.is_scheduled ? currentRow.title : title;
    await ensureDocumentCodeAvailable(client, updatedCode, docId);

    if (currentRow.is_scheduled && payload.source_file) {
      throw new Error('預約版本只允許修改新版本號、修訂日期、發行日期與異動說明。');
    }

    if (payload.source_file && currentRow.source_file_id) {
      throw new Error('PDF 原始編修檔案已存在，不允許覆蓋。');
    }

    if (payload.source_file && !isPdfExt(currentRow.published_ext)) {
      throw new Error('只有 PDF 正式發佈檔案可以新增原始編修檔案。');
    }

    const source = payload.source_file
      ? await insertFile(client, payload.source_file, 2, user)
      : null;

    if (!currentRow.is_scheduled) {
      await client.query(
        `UPDATE dms_doc
            SET dd_code = $2,
                dd_title = $3,
                dd_updby = $4,
                dd_updat = CURRENT_TIMESTAMP
          WHERE dd_id = $1`,
        [docId, updatedCode, updatedTitle, user.id]
      );
    }

    await client.query(
      `UPDATE dms_doc_ver
          SET ddv_no = $2,
              ddv_rev_date = $3,
              ddv_eff_at = $4,
              ddv_chg_note = $5,
              ddv_src_dfi_id = COALESCE(ddv_src_dfi_id, $6),
              ddv_updby = $7,
              ddv_updat = CURRENT_TIMESTAMP
        WHERE ddv_id = $1`,
      [
        versionId,
        versionNumber,
        payload.revision_date,
        payload.effective_at,
        changeNote,
        source?.id || null,
        user.id
      ]
    );

    await client.query(
      `UPDATE dms_doc_ver
          SET ddv_eff_to = $3,
              ddv_updby = $4,
              ddv_updat = CURRENT_TIMESTAMP
        WHERE dd_id = $1
          AND ddv_seq = $2
          AND ddv_cancel_at IS NULL`,
      [docId, currentRow.seq - 1, payload.effective_at, user.id]
    );

    await writeAudit(
      {
        user,
        action: 'DOCUMENT_UPDATED',
        resourceType: 'DOCUMENT',
        folderId: docRow.df_fid,
        documentId: docId,
        versionId,
        metadata: {
          before_data: {
            code: currentRow.code,
            title: currentRow.title,
            version: currentRow.version,
            revision_date: currentRow.revision_date,
            effective_at: currentRow.effective_at,
            change_note: currentRow.change_note,
            has_source_file: Boolean(currentRow.source_file_id)
          },
          after_data: {
            code: updatedCode,
            title: updatedTitle,
            version: versionNumber,
            revision_date: payload.revision_date,
            effective_at: payload.effective_at,
            change_note: changeNote,
            has_source_file: Boolean(currentRow.source_file_id || source?.id)
          }
        }
      },
      client
    );
  });
};

export const cancelLatestVersion = async (user: SessionUser, docId: number, reason: string) => {
  const doc = await query<{ df_fid: number }>(
    `SELECT df_fid
       FROM dms_doc
      WHERE dd_id = $1
        AND dd_status = 1`,
    [docId]
  );
  const docRow = doc.rows[0];

  if (!docRow || !(await canManageFolder(user, docRow.df_fid))) {
    throw new Error('沒有此文件的管理權限。');
  }

  await withTransaction(async (client) => {
    const versions = await client.query<{ id: number; seq: number }>(
      `SELECT ddv_id AS id,
              ddv_seq AS seq
         FROM dms_doc_ver
        WHERE dd_id = $1
          AND ddv_cancel_at IS NULL
        ORDER BY ddv_seq DESC
        LIMIT 2`,
      [docId]
    );

    if (versions.rows.length < 2) {
      throw new Error('第一版文件不可執行撤回最新版，請使用刪除文件或廢止文件。');
    }

    await client.query(
      `UPDATE dms_doc_ver
          SET ddv_cancel_at = CURRENT_TIMESTAMP,
              ddv_cancel_by = $2,
              ddv_cancel_reason = $3,
              ddv_updby = $2,
              ddv_updat = CURRENT_TIMESTAMP
        WHERE ddv_id = $1`,
      [versions.rows[0].id, user.id, reason]
    );
    await client.query(
      `UPDATE dms_doc_ver
          SET ddv_eff_to = NULL,
              ddv_updby = $2,
              ddv_updat = CURRENT_TIMESTAMP
        WHERE ddv_id = $1`,
      [versions.rows[1].id, user.id]
    );
    await writeAudit(
      {
        user,
        action: 'DOCUMENT_VERSION_CANCELLED',
        resourceType: 'VERSION',
        folderId: docRow.df_fid,
        documentId: docId,
        versionId: versions.rows[0].id,
        metadata: { reason }
      },
      client
    );
  });
};

export const deleteScheduledVersion = async (
  user: SessionUser,
  docId: number,
  versionId: number
) => {
  const doc = await query<{ df_fid: number; dd_status: number }>(
    `SELECT df_fid,
            dd_status
       FROM dms_doc
      WHERE dd_id = $1`,
    [docId]
  );
  const docRow = doc.rows[0];

  if (!docRow || docRow.dd_status !== 1) {
    throw new Error('文件不存在或已廢止。');
  }

  const canManage = docRow.df_fid > 0
    ? await canManageFolder(user, docRow.df_fid)
    : isAdmin(user);
  if (!canManage) {
    throw new Error('沒有此文件的管理權限。');
  }

  await withTransaction(async (client) => {
    const scheduled = await client.query<{
      seq: number;
      version: string | null;
      effective_at: string;
      pub_file_id: number;
      src_file_id: number | null;
    }>(
      `SELECT v.ddv_seq AS seq,
              v.ddv_no AS version,
              v.ddv_eff_at::text AS effective_at,
              v.ddv_pub_dfi_id AS pub_file_id,
              v.ddv_src_dfi_id AS src_file_id
         FROM dms_doc d
         JOIN dms_doc_ver v ON v.dd_id = d.dd_id
        WHERE d.dd_id = $1
          AND d.dd_status = 1
          AND v.ddv_id = $2
          AND v.ddv_cancel_at IS NULL
          AND v.ddv_eff_at > CURRENT_TIMESTAMP
          AND NOT EXISTS (
              SELECT 1
               FROM dms_doc_ver newer
               WHERE newer.dd_id = v.dd_id
                 AND newer.ddv_seq > v.ddv_seq
          )
        FOR UPDATE OF d, v`,
      [docId, versionId]
    );
    const scheduledRow = scheduled.rows[0];

    if (!scheduledRow) {
      throw new Error('指定版本不存在、已生效，或不是最新的預約版本。');
    }

    const revisionFiles = await client.query<{ file_id: number }>(
      `SELECT dfi_id AS file_id
         FROM dms_ver_rev
        WHERE ddv_id = $1`,
      [versionId]
    );
    const fileIds = Array.from(new Set([
      scheduledRow.pub_file_id,
      scheduledRow.src_file_id,
      ...revisionFiles.rows.map(row => row.file_id)
    ].filter((fileId): fileId is number => Boolean(fileId))));

    await writeAudit(
      {
        user,
        action: 'DOCUMENT_VERSION_DELETED',
        resourceType: 'VERSION',
        folderId: docRow.df_fid,
        documentId: docId,
        versionId,
        metadata: {
          reason: '刪除尚未生效的預約版本',
          version: scheduledRow.version,
          effective_at: scheduledRow.effective_at
        }
      },
      client
    );

    if (fileIds.length > 0) {
      await client.query(
        `UPDATE dms_file
            SET dfi_status = 0
          WHERE dfi_id = ANY($1::int[])`,
        [fileIds]
      );
    }

    await client.query(
      `DELETE FROM dms_ver_rev
        WHERE ddv_id = $1`,
      [versionId]
    );
    await client.query(
      `DELETE FROM dms_doc_ver
        WHERE ddv_id = $1`,
      [versionId]
    );

    const remaining = await client.query<{ total: string }>(
      `SELECT COUNT(*) AS total
         FROM dms_doc_ver
        WHERE dd_id = $1`,
      [docId]
    );

    if (Number(remaining.rows[0].total) === 0) {
      await client.query(
        `DELETE FROM dms_doc
          WHERE dd_id = $1`,
        [docId]
      );
      return;
    }

    await client.query(
      `UPDATE dms_doc_ver
          SET ddv_eff_to = NULL,
              ddv_updby = $2,
              ddv_updat = CURRENT_TIMESTAMP
        WHERE ddv_id = (
              SELECT previous.ddv_id
                FROM dms_doc_ver previous
               WHERE previous.dd_id = $1
                 AND previous.ddv_cancel_at IS NULL
               ORDER BY previous.ddv_seq DESC
               LIMIT 1
        )`,
      [docId, user.id]
    );
  });
};

export const obsoleteDocument = async (
  user: SessionUser,
  docId: number,
  reason: string,
  file: UploadPayload
) => {
  const doc = await query<{ df_fid: number; dd_parent_id: number | null }>(
    `SELECT df_fid,
            dd_parent_id
       FROM dms_doc
      WHERE dd_id = $1
        AND dd_status = 1`,
    [docId]
  );
  const docRow = doc.rows[0];

  const canManage = docRow
    && (docRow.df_fid > 0 ? await canManageFolder(user, docRow.df_fid) : isAdmin(user));
  if (!docRow || !canManage) {
    throw new Error('沒有此文件的管理權限。');
  }

  await withTransaction(async (client) => {
    const lockedDocument = await client.query<{
      dd_status: number;
      dd_parent_id: number | null;
    }>(
      `SELECT dd_status,
              dd_parent_id
         FROM dms_doc
        WHERE dd_id = $1
        FOR UPDATE`,
      [docId]
    );
    const lockedDocumentRow = lockedDocument.rows[0];
    if (!lockedDocumentRow || lockedDocumentRow.dd_status !== 1) {
      throw new Error('文件狀態已變更，請重新整理後再試。');
    }

    const targets = await client.query<{ dd_id: number }>(
      `SELECT dd_id
         FROM dms_doc
        WHERE dd_status = 1
          AND (
               dd_id = $1
               OR (
                    $2 = true
                    AND dd_parent_id = $1
               )
          )
        ORDER BY CASE WHEN dd_id = $1 THEN 0 ELSE 1 END,
                 dd_id
        FOR UPDATE`,
      [docId, lockedDocumentRow.dd_parent_id === null]
    );
    if (!targets.rows.some((row) => row.dd_id === docId)) {
      throw new Error('文件狀態已變更，請重新整理後再試。');
    }

    const targetIds = targets.rows.map((row) => row.dd_id);
    const obsoleteFile = await insertFile(client, file, 4, user);

    await client.query(
      `UPDATE dms_doc
          SET dd_status = 2,
              dd_obs_at = CURRENT_TIMESTAMP,
              dd_obs_by = $2,
              dd_obs_reason = $3,
              dfi_id = $4,
              dd_obs_src = 1,
              dd_updby = $2,
              dd_updat = CURRENT_TIMESTAMP
        WHERE dd_id = ANY($1::int[])`,
      [targetIds, user.id, reason, obsoleteFile.id]
    );

    for (const targetId of targetIds) {
      await writeAudit({
        user,
        action: 'DOCUMENT_OBSOLETED',
        resourceType: 'DOCUMENT',
        folderId: docRow.df_fid,
        documentId: targetId,
        metadata: {
          reason,
          file_name: file.name,
          parent_document_id: docRow.dd_parent_id === null ? docId : docRow.dd_parent_id,
          cascade_source: targetId === docId ? null : 'PARENT_DOCUMENT'
        }
      }, client);
    }
  });
};

export const deleteFirstVersionDocument = async (user: SessionUser, docId: number) => {
  const doc = await query<{
    df_fid: number;
    dd_status: number;
    dd_parent_id: number | null;
  }>(
    `SELECT df_fid,
            dd_status,
            dd_parent_id
       FROM dms_doc
      WHERE dd_id = $1`,
    [docId]
  );
  const docRow = doc.rows[0];

  if (!docRow || docRow.dd_status !== 1) {
    throw new Error('文件不存在或已廢止。');
  }

  const canManage = docRow.df_fid > 0
    ? await canManageFolder(user, docRow.df_fid)
    : isAdmin(user);
  if (!canManage) {
    throw new Error('沒有此文件的管理權限。');
  }

  await withTransaction(async (client) => {
    const lockedDocument = await client.query<{
      dd_status: number;
      dd_parent_id: number | null;
      related_document_count: string | number;
    }>(
      `SELECT d.dd_status,
              d.dd_parent_id,
              (
                SELECT COUNT(*)
                  FROM dms_doc child
                 WHERE child.dd_parent_id = d.dd_id
              ) AS related_document_count
         FROM dms_doc d
        WHERE d.dd_id = $1
        FOR UPDATE`,
      [docId]
    );
    const lockedDocumentRow = lockedDocument.rows[0];
    if (!lockedDocumentRow || lockedDocumentRow.dd_status !== 1) {
      throw new Error('文件狀態已變更，請重新整理後再試。');
    }
    const isRelatedGroupDelete = lockedDocumentRow.dd_parent_id === null
      && Number(lockedDocumentRow.related_document_count) > 0;
    const targets = await client.query<{
      dd_id: number;
      df_fid: number;
      dd_status: number;
      version_id: number | null;
    }>(
      `SELECT d.dd_id,
              d.df_fid,
              d.dd_status,
              (
                SELECT MAX(v.ddv_id)
                  FROM dms_doc_ver v
                 WHERE v.dd_id = d.dd_id
              ) AS version_id
         FROM dms_doc d
        WHERE d.dd_id = $1
           OR (
                $2 = true
                AND d.dd_parent_id = $1
           )
        ORDER BY CASE WHEN d.dd_id = $1 THEN 0 ELSE 1 END,
                 d.dd_id
        FOR UPDATE`,
      [docId, isRelatedGroupDelete]
    );
    if (!targets.rows.some((row) => row.dd_id === docId && row.dd_status === 1)) {
      throw new Error('文件狀態已變更，請重新整理後再試。');
    }

    if (!isRelatedGroupDelete) {
      const version = await client.query<{
        active_version_count: string;
        active_min_seq: number;
        active_max_seq: number;
      }>(
        `SELECT COUNT(*) FILTER (WHERE ddv_cancel_at IS NULL) AS active_version_count,
                MIN(ddv_seq) FILTER (WHERE ddv_cancel_at IS NULL) AS active_min_seq,
                MAX(ddv_seq) FILTER (WHERE ddv_cancel_at IS NULL) AS active_max_seq
           FROM dms_doc_ver
          WHERE dd_id = $1`,
        [docId]
      );
      const versionRow = version.rows[0];
      if (
        Number(versionRow.active_version_count) !== 1
        || Number(versionRow.active_min_seq) !== 1
        || Number(versionRow.active_max_seq) !== 1
      ) {
        throw new Error('僅目前有效版本為第一版的文件可以刪除。');
      }
    }

    const targetIds = targets.rows.map((row) => row.dd_id);
    for (const target of targets.rows) {
      await writeAudit({
        user,
        action: 'DOCUMENT_DELETED',
        resourceType: 'DOCUMENT',
        folderId: target.df_fid,
        documentId: target.dd_id,
        versionId: target.version_id || undefined,
        metadata: {
          reason: isRelatedGroupDelete ? '主文件連動強制刪除' : '第一版文件刪除',
          parent_document_id: isRelatedGroupDelete ? docId : docRow.dd_parent_id,
          cascade_source: target.dd_id === docId ? null : 'PARENT_DOCUMENT'
        }
      }, client);
    }

    const files = await client.query<{ file_id: number }>(
      `SELECT d.dfi_id AS file_id
         FROM dms_doc d
        WHERE d.dd_id = ANY($1::int[])
          AND d.dfi_id IS NOT NULL
       UNION
       SELECT v.ddv_pub_dfi_id
         FROM dms_doc_ver v
        WHERE v.dd_id = ANY($1::int[])
       UNION
       SELECT v.ddv_src_dfi_id
         FROM dms_doc_ver v
        WHERE v.dd_id = ANY($1::int[])
          AND v.ddv_src_dfi_id IS NOT NULL
       UNION
       SELECT r.dfi_id
         FROM dms_ver_rev r
         JOIN dms_doc_ver v ON v.ddv_id = r.ddv_id
        WHERE v.dd_id = ANY($1::int[])`,
      [targetIds]
    );
    const fileIds = files.rows.map((row) => row.file_id);
    if (fileIds.length > 0) {
      await client.query(
        `UPDATE dms_file
            SET dfi_status = 0
          WHERE dfi_id = ANY($1::int[])`,
        [fileIds]
      );
    }

    await client.query(
      `DELETE FROM dms_ver_rev
        WHERE ddv_id IN (
              SELECT ddv_id
                FROM dms_doc_ver
               WHERE dd_id = ANY($1::int[])
        )`,
      [targetIds]
    );

    await client.query(
      `DELETE FROM dms_doc_ver
        WHERE dd_id = ANY($1::int[])`,
      [targetIds]
    );

    await client.query(
      `DELETE FROM dms_doc
        WHERE dd_id = ANY($1::int[])`,
      [targetIds]
    );
  });
};

export const getFileForAccess = async (
  user: SessionUser,
  requestedVersionId: number | string,
  mode: 'preview' | 'download'
) => {
  const versionId = Number(requestedVersionId);

  if (!Number.isInteger(versionId) || versionId <= 0) {
    if (mode === 'preview') {
      await writeAudit({
        user,
        action: 'DOCUMENT_PREVIEW_DENIED',
        resourceType: 'VERSION',
        resourceId: String(requestedVersionId),
        result: 'DENIED',
        reason: '找不到文件版本。',
        metadata: { attempted_version_id: String(requestedVersionId) }
      });
    }
    throw new Error('找不到文件版本。');
  }

  const result = await query<FileRow>(
    `SELECT d.dd_id,
            d.df_fid,
            d.dd_code,
            d.dd_title,
            d.dd_status,
            v.ddv_id,
            v.ddv_seq,
            v.ddv_no,
            f.dfi_id,
            f.dfi_name,
            f.dfi_path,
            f.dfi_ext,
            f.dfi_mime,
            f.dfi_size
       FROM dms_doc_ver v
       JOIN dms_doc d ON d.dd_id = v.dd_id
       JOIN dms_file f ON f.dfi_id = v.ddv_pub_dfi_id
      WHERE v.ddv_id = $1`,
    [versionId]
  );
  const row = result.rows[0];

  if (!row) {
    if (mode === 'preview') {
      await writeAudit({
        user,
        action: 'DOCUMENT_PREVIEW_DENIED',
        resourceType: 'VERSION',
        resourceId: versionId,
        result: 'DENIED',
        versionId,
        reason: '找不到文件版本。',
        metadata: { attempted_version_id: String(requestedVersionId) }
      });
    }
    throw new Error('找不到文件版本。');
  }

  const canManage = row.df_fid > 0 ? await canManageFolder(user, row.df_fid) : isAdmin(user);
  const isPdf = isPdfExt(row.dfi_ext);
  const isPreviewable = isPreviewableExt(row.dfi_ext);

  const writePreviewDenied = async (reason: string) => {
    await writeAudit({
      user,
      action: 'DOCUMENT_PREVIEW_DENIED',
      resourceType: 'DOCUMENT',
      resourceId: row.dd_id,
      result: 'DENIED',
      folderId: row.df_fid,
      documentId: row.dd_id,
      versionId: row.ddv_id,
      reason,
      metadata: { file_name: row.dfi_name }
    });
  };

  if (!canManage) {
    if (row.dd_status !== 1) {
      if (mode === 'preview') {
        await writePreviewDenied('文件已廢止。');
      }
      throw new Error('文件已廢止。');
    }

    const hasFolderAccess = row.df_fid === 0
      || (await getFolderAccessStatus(user, row.df_fid)) === 'allowed';
    const valid = await query<{ allowed: boolean }>(
      `SELECT EXISTS (
          SELECT 1
            FROM dms_doc_ver v
            JOIN dms_doc d ON d.dd_id = v.dd_id
            LEFT JOIN dms_folders fo ON fo.df_fid = d.df_fid
           WHERE v.ddv_id = $1
             AND d.dd_status = 1
             AND v.ddv_cancel_at IS NULL
             AND v.ddv_eff_at <= CURRENT_TIMESTAMP
             AND (v.ddv_eff_to IS NULL OR CURRENT_TIMESTAMP < v.ddv_eff_to)
             AND (
                  d.df_fid = 0
                  OR $2 = true
             )
        ) AS allowed`,
      [versionId, hasFolderAccess]
    );

    if (!valid.rows[0]?.allowed) {
      if (mode === 'preview') {
        await writePreviewDenied(
          hasFolderAccess ? '文件版本不是目前有效版本。' : '沒有資料夾存取權限。'
        );
      }
      throw new Error('沒有此文件的存取權限。');
    }

    if (mode === 'download' && isPdf) {
      await writeAudit({
        user,
        action: 'DOCUMENT_DOWNLOAD_DENIED',
        resourceType: 'DOCUMENT',
        result: 'DENIED',
        folderId: row.df_fid,
        documentId: row.dd_id,
        versionId: row.ddv_id,
        metadata: { file_name: row.dfi_name }
      });
      throw new Error('一般使用者不可下載 PDF 正式原檔。');
    }

  }

  if (mode === 'preview' && !isPreviewable) {
    throw new Error('此檔案格式不支援線上預覽。');
  }

  const { stream, size } = await createFileStream(row.dfi_path);

  await writeAudit({
    user,
    action: mode === 'preview' ? 'DOCUMENT_PREVIEWED' : 'DOCUMENT_DOWNLOADED',
    resourceType: 'DOCUMENT',
    folderId: row.df_fid,
    documentId: row.dd_id,
    versionId: row.ddv_id,
    metadata: { file_name: row.dfi_name, mime: row.dfi_mime, ext: row.dfi_ext }
  });

  return {
    row,
    stream,
    headers: {
      'content-type': row.dfi_mime || 'application/octet-stream',
      'content-length': String(size),
      'cache-control': 'no-store',
      'content-disposition': buildContentDisposition(
        mode === 'preview' ? 'inline' : 'attachment',
        buildDocumentDownloadFileName(row)
      )
    }
  };
};
