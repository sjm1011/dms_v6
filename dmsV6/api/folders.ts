import { Folder, ApiResponse, FolderACL } from '../types';
import { API_BASE, getAuthHeader, handleResponse } from './client';

export const FoldersAPI = {
  getFolders: async (): Promise<ApiResponse<Folder[]>> => {
    const response = await fetch(`${API_BASE}/folders`, {
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
          managers: f.managers || [],
          manager_names: f.manager_names,
          access_type: f.access_type,
          acl_summary: f.acl_summary,
          child_folder_count: Number(f.child_folder_count || 0),
          document_count: Number(f.document_count || 0)
        }));
    }
    return result;
  },

  createFolder: async (name: string, parentId?: number, managers?: string[]): Promise<ApiResponse<Folder>> => {
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

  updateFolderACL: async (id: string, accessType: number, deptIds: string[], uids: string[]): Promise<ApiResponse<null>> => {
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
