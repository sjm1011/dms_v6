export interface User {
  id: string;
  name: string;
  role: string;
  dept_id: string;
  dept_name: string;
  position: string;
  token?: string;
}

export interface Folder {
  id: string;
  parent_id: string | null;
  root_id: string;
  name: string;
  status: number;
  can_manage?: boolean;
  manager_role?: FolderManagerRole;
  can_assign_co_managers?: boolean;
  can_edit_primary_manager?: boolean;
  access_type?: number;
  acl_summary?: string;
  is_access_inherited?: boolean;
  child_folder_count?: number;
  document_count?: number;
}

export interface DocumentVersion {
  ver_id: string;
  ver_number: string;
  seq?: number;
  file_name?: string;
  file_size: number;
  mime: string;
  ext?: string;
  change_note: string;
  revision_date?: string;
  effective_at: string;
  effective_until?: string | null;
  obsolete_at?: string | null;
  status: 'Effective' | 'Scheduled' | 'History' | 'Cancelled' | 'Obsolete';
  created_by?: string;
  created_at?: string;
  cancel_reason?: string;
  has_source_file?: boolean;

  // 廢止相關後設資料
  obsolete_reason?: string;
  obsolete_doc_name?: string;
  obsolete_doc_size?: number;
  obsolete_doc_ver_id?: string;
}

export interface Document {
  id: string;
  code: string | null;
  title: string;
  status: 'Effective' | 'Obsolete';
  folder_id: string;
  folder_name?: string;
  folder_path?: string;
  manager_role?: FolderManagerRole;
  created_by?: string;
  created_at?: string;
  versions: DocumentVersion[];
  
  // 外層後設資料，用於清單顯示
  ver_id?: string;
  version?: string;
  file_size?: number;
  mime?: string;
  change_note?: string;
  revision_date?: string;
  effective_at?: string;
  obsolete_at?: string | null;

  // 廢止相關後設資料
  obsolete_reason?: string;
  obsolete_doc_name?: string;
  obsolete_doc_size?: number;
  obsolete_doc_ver_id?: string;
  can_manage?: boolean;
  is_pdf?: boolean;
  can_preview?: boolean;
  has_source_file?: boolean;
}

export interface DMSItem {
  id: string;
  code?: string | null;
  name: string;
  type: 'folder' | 'document';
  size: string;
  creator: string;
  time: string;
  status?: string;
  version?: string;
  revision_date?: string;
  effective_at?: string;
  obsolete_at?: string | null;
  versions?: DocumentVersion[];
  mime?: string;
  ver_id?: string;
  file_name?: string;
  folder_id?: string;
  folder_path?: string;
  access_type?: number;
  acl_summary?: string;
  is_access_inherited?: boolean;
  can_manage?: boolean;
  manager_role?: FolderManagerRole;
  child_folder_count?: number;
  document_count?: number;
  is_empty_folder?: boolean;
  is_pdf?: boolean;
  can_preview?: boolean;
  has_source_file?: boolean;
  has_scheduled_version?: boolean;

  // 廢止相關後設資料
  obsolete_reason?: string;
  obsolete_doc_name?: string;
  obsolete_doc_size?: number;
  obsolete_doc_ver_id?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error: string;
}

export interface DocumentSearchResult {
  documents: Document[];
  total: number;
  page: number;
  page_size: number;
}

export interface Department {
  dept_id: string;
  dept_name: string;
}

export interface FolderACL {
  access_type: number; // 1: 公開, 2: 限閱
  dept_ids: string[];
  uids: string[];
  is_inherited: boolean;
  inherited_from_folder_id: string | null;
}

export interface FolderManagerInfo {
  names: string[];
  co_manager_names: string[];
  employee_ids?: string[];
}

export type FolderAccessStatus = 'allowed' | 'denied';

export type FolderManagerAssignmentType = 'PRIMARY' | 'CO_MANAGER';
export type FolderManagerRole = FolderManagerAssignmentType | null;

export type SystemPage = 'audit' | 'settings' | 'permissions' | 'status' | 'recycle';

export interface AuditLogItem {
  id: string;
  event_at: string;
  actor_uid: string | null;
  actor_name: string | null;
  actor_role: string | null;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  result: string;
  reason: string | null;
  before_data: Record<string, unknown>;
  after_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  folder_id: string | null;
  document_id: string | null;
  version_id: string | null;
  folder_name: string | null;
  document_name: string | null;
  resource_location: string | null;
  target_type: string | null;
  target_name: string | null;
  target_version: string | null;
}

export interface SystemAdminItem {
  emp_id: string;
  emp_name: string;
  dept_name: string;
  assigned_by: string;
  assigned_at: string;
}

export interface PermissionOverviewItem {
  folder_id: string;
  folder_name: string;
  primary_managers: string;
  co_managers: string;
  access_type: number;
  acl_summary: string;
  child_folder_count: number;
  document_count: number;
}

export interface RecycleBatchItem {
  folder_id: string;
  folder_name: string;
  folder_path: string;
  archived_by: string;
  archived_at: string;
  can_purge: boolean;
  child_folder_count: number;
  document_count: number;
  file_count: number;
  total_bytes: number;
}

export interface PurgeJobItem {
  job_id: string;
  folder_id: string;
  status: string;
  requested_by: string;
  requested_at: string;
  retry_count: number;
  error: string | null;
}

export interface SystemStatusData {
  application: { version: string; environment: string; server_time: string; uptime_seconds: number };
  database: { connected: boolean; version: string; database_time: string; latency_ms: number; pool_total: number; pool_idle: number; pool_waiting: number };
  storage: { root: string; readable: boolean; writable: boolean; total_bytes: number; free_bytes: number; error?: string };
  configuration: { session_secret_secure: boolean; storage_root_configured: boolean; secure_cookie: boolean; database_configured: boolean };
  statistics: Record<string, number>;
}
