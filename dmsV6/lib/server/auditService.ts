import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import type { PoolClient } from 'pg';
import { query } from './db';
import type { SessionUser } from '../session';
import { getClientIpFromHeaders } from './request';

interface AuditContextSnapshot {
  resource_location: string;
  target_type: string;
  target_name: string;
  target_version: string | null;
}

export interface AuditPayload {
  user?: SessionUser;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | number | null;
  result?: string;
  folderId?: number | null;
  documentId?: number | null;
  versionId?: number | null;
  managedFolderId?: number | null;
  reason?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  required?: boolean;
}

const insertAuditSql = `
INSERT INTO dms_log (
       dl_actor_uid,
       dl_actor_name,
       dl_actor_role,
       dl_action,
       dl_resource_type,
       dl_resource_id,
       dl_result,
       dl_managed_df_fid,
       df_fid,
       dd_id,
       ddv_id,
       dl_reason,
       dl_before_data,
       dl_after_data,
       dl_metadata,
       dl_ip_address,
       dl_user_agent,
       dl_request_id,
       dl_event_at
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
       $10,
       $11,
       $12,
       $13::jsonb,
       $14::jsonb,
       $15::jsonb,
       $16,
       $17,
       $18,
       CURRENT_TIMESTAMP
)`;

const selectRows = async <T extends Record<string, unknown>>(
  client: PoolClient | undefined,
  sql: string,
  params: unknown[]
) => client ? (await client.query<T>(sql, params)).rows : (await query<T>(sql, params)).rows;

const getFolderLocation = async (folderId: number | null | undefined, client?: PoolClient) => {
  if (folderId === 0) return '檔案庫';
  if (!folderId) return '';

  const rows = await selectRows<{ folder_path: string | null }>(
    client,
    `WITH RECURSIVE ancestors AS (
        SELECT f.df_fid,
               f.df_pid,
               f.df_name,
               0 AS depth
          FROM dms_folders f
         WHERE f.df_fid = $1
        UNION ALL
        SELECT p.df_fid,
               p.df_pid,
               p.df_name,
               a.depth + 1 AS depth
          FROM dms_folders p
          JOIN ancestors a ON a.df_pid = p.df_fid
      )
      SELECT CASE
               WHEN COUNT(*) = 0 THEN NULL
               ELSE '檔案庫 / ' || STRING_AGG(df_name, ' / ' ORDER BY depth DESC)
             END AS folder_path
        FROM ancestors`,
    [folderId]
  );
  return rows[0]?.folder_path || '';
};

const getDocumentTarget = async (payload: AuditPayload, client?: PoolClient) => {
  if (!payload.documentId) return null;
  const rows = await selectRows<{ document_name: string | null; version: string | null }>(
    client,
    `SELECT COALESCE(f.dfi_name, d.dd_title) AS document_name,
            v.ddv_no AS version
       FROM dms_doc d
       LEFT JOIN dms_doc_ver v ON v.ddv_id = $2
                              AND v.dd_id = d.dd_id
       LEFT JOIN dms_file f ON f.dfi_id = v.ddv_pub_dfi_id
      WHERE d.dd_id = $1`,
    [payload.documentId, payload.versionId ?? null]
  );
  return rows[0] || null;
};

const textValue = (value: unknown) => typeof value === 'string' || typeof value === 'number'
  ? String(value).trim()
  : '';

const buildAuditContext = async (payload: AuditPayload, client?: PoolClient): Promise<AuditContextSnapshot> => {
  const metadata = payload.metadata || {};
  const document = await getDocumentTarget(payload, client);
  const folderLocation = await getFolderLocation(payload.folderId, client);
  const resourceType = payload.resourceType.toUpperCase();
  const metadataName = textValue(metadata.file_name) || textValue(metadata.name) || textValue(metadata.title);

  if (resourceType === 'AUTH') {
    return {
      resource_location: 'DMS 登入介面',
      target_type: 'AUTH',
      target_name: 'DMS 文件管理系統',
      target_version: null
    };
  }

  if (resourceType === 'ADMIN') {
    const beforeName = textValue(payload.beforeData?.emp_name);
    const afterName = textValue(payload.afterData?.emp_name);
    const employeeId = textValue(payload.resourceId)
      || textValue(payload.beforeData?.emp_id)
      || textValue(payload.afterData?.emp_id);
    return {
      resource_location: '系統管理 / 系統設定',
      target_type: 'ADMIN',
      target_name: [afterName || beforeName, employeeId].filter(Boolean).join(' ') || '系統管理員設定',
      target_version: null
    };
  }

  if (resourceType === 'AUDIT') {
    const rowCount = Number(metadata.row_count);
    return {
      resource_location: '系統管理 / 系統稽核紀錄',
      target_type: 'AUDIT',
      target_name: Number.isFinite(rowCount) ? `系統稽核紀錄（${rowCount} 筆）` : '系統稽核紀錄',
      target_version: null
    };
  }

  if (payload.documentId) {
    return {
      resource_location: folderLocation || '檔案庫',
      target_type: payload.versionId ? 'VERSION' : 'DOCUMENT',
      target_name: document?.document_name || metadataName || `文件識別碼 ${payload.documentId}`,
      target_version: document?.version || textValue(metadata.version) || null
    };
  }

  const folderName = folderLocation.split(' / ').at(-1) || metadataName;
  return {
    resource_location: folderLocation || '檔案庫',
    target_type: resourceType,
    target_name: resourceType === 'ACL'
      ? `${folderName || `資料夾識別碼 ${payload.folderId}`}（存取權限）`
      : folderName || metadataName || textValue(payload.resourceId) || '系統資源',
    target_version: null
  };
};

const getRequestContext = async () => {
  try {
    const requestHeaders = await headers();
    return {
      ipAddress: getClientIpFromHeaders(requestHeaders),
      userAgent: requestHeaders.get('user-agent'),
      requestId: requestHeaders.get('x-request-id') || requestHeaders.get('x-correlation-id') || randomUUID()
    };
  } catch {
    return { ipAddress: null, userAgent: null, requestId: randomUUID() };
  }
};

export const writeAudit = async (payload: AuditPayload, client?: PoolClient) => {
  const requestContext = await getRequestContext();
  const metadata = { ...(payload.metadata || {}) };
  const nestedBeforeData = metadata.before_data;
  const nestedAfterData = metadata.after_data;
  const nestedReason = textValue(metadata.reason);
  delete metadata.before_data;
  delete metadata.after_data;
  delete metadata.reason;

  const beforeData = payload.beforeData
    || (nestedBeforeData && typeof nestedBeforeData === 'object' && !Array.isArray(nestedBeforeData) ? nestedBeforeData as Record<string, unknown> : {});
  const afterData = payload.afterData
    || (nestedAfterData && typeof nestedAfterData === 'object' && !Array.isArray(nestedAfterData) ? nestedAfterData as Record<string, unknown> : {});
  let auditContext: AuditContextSnapshot;
  try {
    auditContext = await buildAuditContext({ ...payload, metadata, beforeData, afterData }, client);
  } catch (error) {
    if (payload.required) throw error;
    auditContext = {
      resource_location: '系統',
      target_type: payload.resourceType,
      target_name: textValue(payload.resourceId) || '系統資源',
      target_version: textValue(metadata.version) || null
    };
  }
  metadata.audit_context = auditContext;

  const params = [
    payload.actorUid ?? payload.user?.id ?? null,
    payload.actorName ?? payload.user?.name ?? null,
    payload.actorRole ?? payload.user?.role ?? null,
    payload.action,
    payload.resourceType,
    payload.resourceId === undefined || payload.resourceId === null ? null : String(payload.resourceId),
    payload.result || 'SUCCESS',
    payload.managedFolderId ?? null,
    payload.folderId ?? null,
    payload.documentId ?? null,
    payload.versionId ?? null,
    payload.reason || nestedReason || null,
    JSON.stringify(beforeData),
    JSON.stringify(afterData),
    JSON.stringify(metadata),
    requestContext.ipAddress,
    requestContext.userAgent,
    requestContext.requestId
  ];

  try {
    if (client) {
      await client.query(insertAuditSql, params);
      return;
    }

    await query(insertAuditSql, params);
  } catch (error) {
    if (payload.required) {
      throw error;
    }
    // 稽核表 schema 若尚未建置，不阻斷主要功能。
  }
};
