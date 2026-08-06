import type { ApiResponse, DashboardData } from '../types';
import { API_BASE, apiFetch, getAuthHeader, handleResponse } from './client';

export const DashboardAPI = {
  getDashboard: async (): Promise<ApiResponse<DashboardData>> => {
    const response = await apiFetch(`${API_BASE}/dashboard`, {
      cache: 'no-store',
      headers: getAuthHeader()
    });
    return await handleResponse(response);
  },

  markAnnouncementRead: async (
    announcementId: string,
    revision: number
  ): Promise<ApiResponse<null>> => {
    const response = await apiFetch(`${API_BASE}/dashboard/announcements/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        announcement_id: Number(announcementId),
        revision
      })
    });
    return await handleResponse(response);
  }
};
