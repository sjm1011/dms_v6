import type { ApiResponse, AppTheme, AuthSessionData } from '../types';
import { API_BASE, apiFetch, getAuthHeader, handleResponse } from './client';

export const AuthAPI = {
  login: async (uid: string, pwd: string, theme: AppTheme): Promise<ApiResponse<AuthSessionData>> => {
    const response = await apiFetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, pwd, theme })
    });
    return await handleResponse(response);
  },

  session: async (): Promise<ApiResponse<AuthSessionData>> => {
    const response = await apiFetch(`${API_BASE}/session`, {
      cache: 'no-store'
    });
    return await handleResponse(response);
  },

  updateTheme: async (theme: AppTheme): Promise<ApiResponse<{ theme: AppTheme }>> => {
    const response = await apiFetch(`${API_BASE}/preferences/theme`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme })
    });
    return await handleResponse(response);
  },

  logout: async (): Promise<ApiResponse<null>> => {
    const response = await fetch(`${API_BASE}/logout`, {
      method: 'POST'
    });
    return await handleResponse(response);
  },

  test: async (): Promise<ApiResponse<any>> => {
    const response = await fetch(`${API_BASE}/test`, {
      headers: getAuthHeader()
    });
    return await handleResponse(response);
  }
};
