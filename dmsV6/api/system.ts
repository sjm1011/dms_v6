import type { ApiResponse, AuditLogItem, PermissionOverviewItem, PurgeJobItem, RecycleBatchItem, SystemAdminItem, SystemStatusData } from '../types';
import { API_BASE, apiFetch, getAuthHeader, handleResponse } from './client';

export interface AuditQuery {
  date_from?: string;
  date_to?: string;
  actor?: string;
  action?: string;
  result?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}

const auditParams = (query: AuditQuery) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params;
};

export const SystemAPI = {
  getAuditLogs: async (query: AuditQuery): Promise<ApiResponse<{ rows: AuditLogItem[]; total: number; page: number; page_size: number; actions: string[] }>> => {
    const response = await apiFetch(`${API_BASE}/system/audit?${auditParams(query).toString()}`, { cache: 'no-store', headers: getAuthHeader() });
    return await handleResponse(response);
  },
  exportAuditLogs: async (query: AuditQuery) => {
    const response = await apiFetch(`${API_BASE}/system/audit/export?${auditParams(query).toString()}`, { cache: 'no-store', headers: getAuthHeader() }, 60_000);
    if (!response.ok) await handleResponse(response);
    return await response.blob();
  },
  getAdmins: async (): Promise<ApiResponse<SystemAdminItem[]>> => {
    const response = await apiFetch(`${API_BASE}/system/settings/admins`, { cache: 'no-store', headers: getAuthHeader() });
    return await handleResponse(response);
  },
  assignAdmin: async (employeeId: string): Promise<ApiResponse<null>> => {
    const response = await apiFetch(`${API_BASE}/system/settings/admins`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ employee_id: employeeId }) });
    return await handleResponse(response);
  },
  revokeAdmin: async (employeeId: string): Promise<ApiResponse<null>> => {
    const response = await apiFetch(`${API_BASE}/system/settings/admins`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify({ employee_id: employeeId }) });
    return await handleResponse(response);
  },
  getPermissions: async (): Promise<ApiResponse<PermissionOverviewItem[]>> => {
    const response = await apiFetch(`${API_BASE}/system/permissions`, { cache: 'no-store', headers: getAuthHeader() });
    return await handleResponse(response);
  },
  getStatus: async (): Promise<ApiResponse<SystemStatusData>> => {
    const response = await apiFetch(`${API_BASE}/system/status`, { cache: 'no-store', headers: getAuthHeader() });
    return await handleResponse(response);
  },
  getRecycle: async (): Promise<ApiResponse<{ batches: RecycleBatchItem[]; jobs: PurgeJobItem[] }>> => {
    const response = await apiFetch(`${API_BASE}/system/recycle`, { cache: 'no-store', headers: getAuthHeader() });
    return await handleResponse(response);
  },
  recycleAction: async (payload: Record<string, unknown>): Promise<ApiResponse<null | { job_id: string }>> => {
    const response = await apiFetch(`${API_BASE}/system/recycle`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() }, body: JSON.stringify(payload) }, 60_000);
    return await handleResponse(response);
  }
};
