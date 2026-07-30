import type { ApiResponse, DocumentSearchResult } from '../types';
import { API_BASE, apiFetch, getAuthHeader, handleResponse } from './client';

export const SearchAPI = {
  searchDocuments: async (
    keyword: string,
    page: number,
    signal?: AbortSignal
  ): Promise<ApiResponse<DocumentSearchResult>> => {
    const params = new URLSearchParams({
      keyword,
      page: String(page),
      page_size: '50'
    });
    const response = await apiFetch(`${API_BASE}/search?${params.toString()}`, {
      signal,
      headers: getAuthHeader()
    });
    return await handleResponse(response);
  }
};
