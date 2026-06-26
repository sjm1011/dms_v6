import type { PoolClient } from 'pg';
import type { Document, DocumentVersion } from '../../types';
import type { SessionUser } from '../session';
import { isAdmin } from './auth';
import { canManageFolder } from './folderService';
import { query, withTransaction } from './db';
import { writeAudit } from './auditService';
import {
  buildContentDisposition,
  createFileStream,
  getFileExt,
  isHtmlExt,
  isPdfExt,
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
}

interface DocumentRow extends VersionRow {
  id: number;
  code: string;
  title: string;
  doc_status: number;
  folder_id: number;
  obsolete_at: string | null;
  obsolete_reason: string | null;
  can_manage: boolean;
}

interface FileRow {
  dd_id: number;
  df_fid: number;
  dd_code: string;
  dd_title: string;
  dd_status: number;
  ddv_id: number;
  ddv_no: string | null;
  dfi_id: number;
  dfi_name: string;
  dfi_path: string;
  dfi_ext: string;
  dfi_mime: string;
  dfi_size: string | number;
}

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
  cancel_reason: row.cancel_reason || undefined
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
    versions,
    ver_id: current?.ver_id,
    version: current?.ver_number,
    file_size: current?.file_size,
    mime: current?.mime,
    change_note: current?.change_note,
    effective_at: current?.effective_at,
    obsolete_at: first.obsolete_at,
    obsolete_reason: first.obsolete_reason || undefined,
    can_manage: first.can_manage,
    is_pdf: current ? isPdfExt(current.ext || getFileExt(current.file_name || '')) : false,
    can_preview: current ? isPdfExt(current.ext || '') || isHtmlExt(current.ext || '') : false
  };
};

export const listDocuments = async (user: SessionUser, folderId: number) => {
  const canManage = folderId > 0 ? await canManageFolder(user, folderId) : isAdmin(user);
  const result = await query<DocumentRow>(
    `WITH visible_doc AS (
        SELECT d.dd_id
          FROM dms_doc d
          LEFT JOIN dms_folders f ON f.df_fid = d.df_fid
         WHERE d.df_fid = $1
           AND (
                $3 = true
                OR (
                    d.dd_status = 1
                    AND (
                         d.df_fid = 0
                         OR f.df_access_type = 1
                         OR EXISTS (
                             SELECT 1
                               FROM dms_folder_acl a
                              WHERE a.df_fid = d.df_fid
                                AND a.dfa_dc = 'N'
                                AND (
                                     (a.dfa_type = 1 AND a.dfa_target = $4)
                                     OR (a.dfa_type = 2 AND UPPER(a.dfa_target) = UPPER($2))
                                )
                         )
                    )
                )
           )
      )
      SELECT d.dd_id AS id,
             d.dd_code AS code,
             d.dd_title AS title,
             d.dd_status AS doc_status,
             d.df_fid AS folder_id,
             d.dd_obs_at AS obsolete_at,
             d.dd_obs_reason AS obsolete_reason,
             $3 AS can_manage,
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
       WHERE $3 = true
          OR (
              d.dd_status = 1
              AND v.ddv_cancel_at IS NULL
              AND v.ddv_eff_at <= CURRENT_TIMESTAMP
              AND (v.ddv_eff_to IS NULL OR CURRENT_TIMESTAMP < v.ddv_eff_to)
          )
       ORDER BY d.dd_code,
                d.dd_id,
                v.ddv_seq DESC`,
    [folderId, user.id, canManage, user.dept_id || '']
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
  }
) => {
  const folderId = Number(payload.folder_id || 0);
  const canManage = folderId > 0 ? await canManageFolder(user, folderId) : isAdmin(user);

  if (!canManage) {
    throw new Error('沒有此資料夾的文件管理權限。');
  }

  return withTransaction(async (client) => {
    const published = await insertFile(client, payload.file, 1, user);
    const source =
      payload.source_file && isPdfExt(published.storedFile.ext)
        ? await insertFile(client, payload.source_file, 2, user)
        : null;
    const doc = await client.query<{ id: number }>(
      `INSERT INTO dms_doc (
             df_fid,
             dd_code,
             dd_title,
             dd_status,
             dd_crtby,
             dd_crtat
       ) VALUES (
             $1,
             $2,
             $3,
             1,
             $4,
             CURRENT_TIMESTAMP
       )
       RETURNING dd_id AS id`,
      [folderId, payload.code, payload.title, user.id]
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
        payload.version || null,
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
        metadata: { code: payload.code, title: payload.title, file_name: payload.file.name }
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
        payload.version || null,
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

export const obsoleteDocument = async (
  user: SessionUser,
  docId: number,
  reason: string,
  file: UploadPayload
) => {
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
        WHERE dd_id = $1`,
      [docId, user.id, reason, obsoleteFile.id]
    );
    await writeAudit(
      {
        user,
        action: 'DOCUMENT_OBSOLETED',
        resourceType: 'DOCUMENT',
        folderId: docRow.df_fid,
        documentId: docId,
        metadata: { reason, file_name: file.name }
      },
      client
    );
  });
};

export const deleteFirstVersionDocument = async (user: SessionUser, docId: number) => {
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
    const version = await client.query<{
      total_version_count: string;
      active_version_count: string;
      min_seq: number;
      max_seq: number;
      version_id: number;
      pub_file_id: number;
      src_file_id: number | null;
    }>(
      `SELECT COUNT(*) AS total_version_count,
              SUM(CASE WHEN ddv_cancel_at IS NULL THEN 1 ELSE 0 END) AS active_version_count,
              MIN(ddv_seq) AS min_seq,
              MAX(ddv_seq) AS max_seq,
              MIN(ddv_id) AS version_id,
              MIN(ddv_pub_dfi_id) AS pub_file_id,
              MIN(ddv_src_dfi_id) AS src_file_id
         FROM dms_doc_ver
        WHERE dd_id = $1`,
      [docId]
    );
    const versionRow = version.rows[0];

    if (
      Number(versionRow.total_version_count) !== 1 ||
      Number(versionRow.active_version_count) !== 1 ||
      Number(versionRow.min_seq) !== 1 ||
      Number(versionRow.max_seq) !== 1
    ) {
      throw new Error('僅第一版且未版更的文件可以刪除。');
    }

    await writeAudit(
      {
        user,
        action: 'DOCUMENT_DELETED',
        resourceType: 'DOCUMENT',
        folderId: docRow.df_fid,
        documentId: docId,
        versionId: versionRow.version_id,
        metadata: { reason: '第一版文件刪除' }
      },
      client
    );

    const fileIds = [versionRow.pub_file_id, versionRow.src_file_id].filter(
      (fileId): fileId is number => Boolean(fileId)
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
      [versionRow.version_id]
    );

    await client.query(
      `DELETE FROM dms_doc_ver
        WHERE dd_id = $1`,
      [docId]
    );

    await client.query(
      `DELETE FROM dms_doc
        WHERE dd_id = $1`,
      [docId]
    );
  });
};

export const getFileForAccess = async (
  user: SessionUser,
  versionId: number,
  mode: 'preview' | 'download'
) => {
  const result = await query<FileRow>(
    `SELECT d.dd_id,
            d.df_fid,
            d.dd_code,
            d.dd_title,
            d.dd_status,
            v.ddv_id,
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
    throw new Error('找不到文件版本。');
  }

  const canManage = row.df_fid > 0 ? await canManageFolder(user, row.df_fid) : isAdmin(user);
  const isPdf = isPdfExt(row.dfi_ext);
  const isHtml = isHtmlExt(row.dfi_ext);

  if (!canManage) {
    if (row.dd_status !== 1) {
      throw new Error('文件已廢止。');
    }

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
                  OR fo.df_access_type = 1
                  OR EXISTS (
                      SELECT 1
                        FROM dms_folder_acl a
                       WHERE a.df_fid = d.df_fid
                         AND a.dfa_dc = 'N'
                         AND (
                              (a.dfa_type = 1 AND a.dfa_target = $3)
                              OR (a.dfa_type = 2 AND UPPER(a.dfa_target) = UPPER($2))
                         )
                  )
             )
        ) AS allowed`,
      [versionId, user.id, user.dept_id || '']
    );

    if (!valid.rows[0]?.allowed) {
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

    if (mode === 'preview' && !isPdf && !isHtml) {
      throw new Error('此檔案格式不支援線上預覽。');
    }
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
      'content-disposition': buildContentDisposition(mode === 'preview' ? 'inline' : 'attachment', row.dfi_name)
    }
  };
};
