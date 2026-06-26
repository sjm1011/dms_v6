import { User, ApiResponse } from '../types';
import { API_BASE, getAuthHeader, handleResponse } from './client';

export const AuthAPI = {
  login: async (uid: string, pwd: string): Promise<ApiResponse<User>> => {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, pwd })
    });
    return await handleResponse(response);
  },

  session: async (): Promise<ApiResponse<User>> => {
    const response = await fetch(`${API_BASE}/session`, {
      cache: 'no-store'
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
