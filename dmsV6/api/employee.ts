import { ApiResponse, Department } from '../types';
import { API_BASE, getAuthHeader, handleResponse } from './client';

export interface EmployeeItem {
  uid: string;
  name: string;
}

export const EmployeeAPI = {
  getEmployeeByUid: async (uid: string): Promise<ApiResponse<EmployeeItem[]>> => {
    const response = await fetch(`${API_BASE}/employee?uid=${encodeURIComponent(uid)}`, {
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
