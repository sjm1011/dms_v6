import { ApiResponse, Department } from '../types';
import { API_BASE, getAuthHeader, handleResponse } from './client';

export interface EmployeeItem {
  uid: string;
  name: string;
}

export type EmployeeLookupPurpose = 'folder_manager' | 'folder_acl' | 'system_admin';

export const EmployeeAPI = {
  getEmployeeByUid: async (
    uid: string,
    purpose: EmployeeLookupPurpose,
    folderId?: string
  ): Promise<ApiResponse<EmployeeItem[]>> => {
    const params = new URLSearchParams({
      uid,
      purpose
    });
    if (folderId) {
      params.set('fid', folderId);
    }
    const response = await fetch(`${API_BASE}/employee?${params.toString()}`, {
      headers: getAuthHeader()
    });
    return await handleResponse(response);
  },

  getDepartments: async (): Promise<ApiResponse<Department[]>> => {
    const response = await fetch(`${API_BASE}/departments`, {
      headers: getAuthHeader()
    });
    return await handleResponse(response);
  }
};
