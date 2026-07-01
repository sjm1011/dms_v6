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
