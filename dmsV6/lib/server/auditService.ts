import type { PoolClient } from 'pg';
import { query } from './db';
import type { SessionUser } from '../session';

interface AuditPayload {
  user?: SessionUser;
  action: string;
  resourceType: string;
  result?: string;
  folderId?: number | null;
  documentId?: number | null;
  versionId?: number | null;
  managedFolderId?: number | null;
  metadata?: Record<string, unknown>;
}

const insertAuditSql = `
INSERT INTO dms_audit_log (
       actor_uid,
       actor_name,
       actor_role,
       action,
       resource_type,
       result,
       managed_folder_id,
       folder_id,
       document_id,
       version_id,
       metadata,
       event_at
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
       $11::jsonb,
       CURRENT_TIMESTAMP
)`;

export const writeAudit = async (payload: AuditPayload, client?: PoolClient) => {
  const params = [
    payload.user?.id || null,
    payload.user?.name || null,
    payload.user?.role || null,
    payload.action,
    payload.resourceType,
    payload.result || 'SUCCESS',
    payload.managedFolderId ?? null,
    payload.folderId ?? null,
    payload.documentId ?? null,
    payload.versionId ?? null,
    JSON.stringify(payload.metadata || {})
  ];

  try {
    if (client) {
      await client.query(insertAuditSql, params);
      return;
    }

    await query(insertAuditSql, params);
  } catch {
    // 稽核表 schema 若尚未建置，不阻斷主要功能。
  }
};
