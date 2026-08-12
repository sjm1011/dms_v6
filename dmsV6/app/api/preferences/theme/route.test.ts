import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { requireSession } from '../../../../lib/server/auth';
import {
  getUserThemeOrDefault,
  updateUserTheme
} from '../../../../lib/server/userPreferenceService';
import { GET, PUT } from './route';

vi.mock('../../../../lib/server/auth', () => ({
  requireSession: vi.fn()
}));

vi.mock('../../../../lib/server/userPreferenceService', () => ({
  getUserThemeOrDefault: vi.fn(),
  isAppTheme: (value: unknown) => value === 'modern-dark' || value === 'modern-light',
  updateUserTheme: vi.fn()
}));

const requireSessionMock = vi.mocked(requireSession);
const getUserThemeOrDefaultMock = vi.mocked(getUserThemeOrDefault);
const updateUserThemeMock = vi.mocked(updateUserTheme);

describe('使用者佈景主題 Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionMock.mockReturnValue({
      token: 'test-token',
      user: {
        id: 'A001',
        name: '測試使用者',
        role: 'USER',
        dept_id: '',
        dept_name: '',
        position: ''
      }
    });
  });

  it('讀取目前登入使用者的佈景主題', async () => {
    getUserThemeOrDefaultMock.mockResolvedValue('modern-dark');
    const response = await GET(new NextRequest('http://localhost/api/preferences/theme'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { theme: 'modern-dark' },
      error: ''
    });
    expect(getUserThemeOrDefaultMock).toHaveBeenCalledWith('A001');
  });

  it('更新只能套用至目前登入使用者', async () => {
    updateUserThemeMock.mockResolvedValue('modern-light');
    const response = await PUT(new NextRequest('http://localhost/api/preferences/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'modern-light', user_id: 'B002' })
    }));

    expect(response.status).toBe(200);
    expect(updateUserThemeMock).toHaveBeenCalledWith('A001', 'modern-light');
  });

  it('拒絕不支援的佈景主題', async () => {
    const response = await PUT(new NextRequest('http://localhost/api/preferences/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'unknown-theme' })
    }));

    expect(response.status).toBe(400);
    expect(updateUserThemeMock).not.toHaveBeenCalled();
  });

  it('未登入時拒絕讀取設定', async () => {
    requireSessionMock.mockImplementation(() => {
      throw new Error('尚未登入或登入狀態已失效。');
    });
    const response = await GET(new NextRequest('http://localhost/api/preferences/theme'));

    expect(response.status).toBe(401);
  });
});
