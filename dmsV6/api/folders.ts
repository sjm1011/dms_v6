import {
  Folder,
  ApiResponse,
  FolderACL,
  FolderAccessStatus,
  FolderAccessType,
  FolderManagerInfo
} from '../types';
import { API_BASE, apiFetch, getAuthHeader, handleResponse } from './client';

export const FoldersAPI = {
  getFolderAccessStatus: async (
    fid: string,
    signal?: AbortSignal
  ): Promise<ApiResponse<FolderAccessStatus>> => {
    const params = new URLSearchParams({ access_fid: fid });
    const response = await apiFetch(`${API_BASE}/folders?${params.toString()}`, {
      signal,
      cache: 'no-store',
      headers: getAuthHeader()
    });
    return await handleResponse(response);
  },

  getFolders: async (signal?: AbortSignal): Promise<ApiResponse<Folder[]>> => {
    const response = await apiFetch(`${API_BASE}/folders`, {
      signal,
      headers: getAuthHeader()
    });
    const result = await handleResponse(response);
    if (result.success && result.data) {
      result.data = result.data
        .filter((f: any) => f.status === 1)
        .map((f: any) => ({
          id: f.id.toString(),
          parent_id: f.parent_id ? f.parent_id.toString() : null,
          root_id: f.root_id.toString(),
          name: f.name,
          status: f.status,
          can_manage: Boolean(f.can_manage),
          manager_role: f.manager_role || null,
          can_assign_co_managers: Boolean(f.can_assign_co_managers),
          can_edit_primary_manager: Boolean(f.can_edit_primary_manager),
          access_type: f.access_type,
          acl_summary: f.acl_summary,
          is_access_inherited: Boolean(f.is_access_inherited),
          child_folder_count: Number(f.child_folder_count || 0),
          document_count: Number(f.document_count || 0)
        }));
    }
    return result;
  },

  createFolder: async (
    name: string,
    parentId?: number,
    managers?: string[]
  ): Promise<ApiResponse<Pick<Folder, 'id'>>> => {
    const payload: any = { name };
    if (parentId !== undefined && parentId !== null) {
      payload.parent_id = parentId;
    }
    if (managers !== undefined && managers !== null) {
      payload.managers = managers;
    }
    const response = await fetch(`${API_BASE}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload)
    });
    return await handleResponse(response);
  },

  renameFolder: async (id: string, newName: string, managers?: string[]): Promise<ApiResponse<null>> => {
    const payload: any = { id: parseInt(id, 10), name: newName };
    if (managers !== undefined && managers !== null) {
      payload.managers = managers;
    }
    const response = await fetch(`${API_BASE}/folders`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload)
    });
    return await handleResponse(response);
  },

  archiveFolder: async (id: string): Promise<ApiResponse<null>> => {
    const response = await fetch(`${API_BASE}/folders`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ id: parseInt(id, 10), action: 'archive' })
    });
    return await handleResponse(response);
  },

  deleteFolder: async (id: string): Promise<ApiResponse<null>> => {
    const response = await fetch(`${API_BASE}/folders`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ id: parseInt(id, 10), action: 'delete' })
    });
    return await handleResponse(response);
  },

  getFolderACL: async (fid: string): Promise<ApiResponse<FolderACL>> => {
    const response = await fetch(`${API_BASE}/folders/acl?fid=${fid}`, {
      headers: getAuthHeader()
    });
    return await handleResponse(response);
  },

  getFolderManagers: async (
    fid: string,
    includeEmployeeIds = false,
    signal?: AbortSignal,
    assignmentType: 'PRIMARY' | 'CO_MANAGER' = 'CO_MANAGER'
  ): Promise<ApiResponse<FolderManagerInfo>> => {
    const params = new URLSearchParams({ fid });
    if (includeEmployeeIds) {
      params.set('include_employee_ids', '1');
      params.set('assignment_type', assignmentType);
    }
    const response = await fetch(`${API_BASE}/folders/managers?${params.toString()}`, {
      signal,
      cache: 'no-store',
      headers: getAuthHeader()
    });
    return await handleResponse(response);
  },

  updateFolderManagers: async (
    fid: string,
    assignmentType: 'PRIMARY' | 'CO_MANAGER',
    managers: string[]
  ): Promise<ApiResponse<null>> => {
    const response = await fetch(`${API_BASE}/folders/managers`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        folder_id: Number(fid),
        assignment_type: assignmentType,
        managers
      })
    });
    return await handleResponse(response);
  },

  updateFolderACL: async (
    id: string,
    accessType: FolderAccessType,
    deptIds: string[],
    uids: string[]
  ): Promise<ApiResponse<null>> => {
    const response = await fetch(`${API_BASE}/folders/acl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        id: parseInt(id, 10),
        access_type: accessType,
        dept_ids: deptIds,
        uids: uids
      })
    });
    return await handleResponse(response);
  }
};
