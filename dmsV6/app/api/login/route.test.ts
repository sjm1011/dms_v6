import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { loginUser } from '../../../lib/server/auth';
import { writeAudit } from '../../../lib/server/auditService';
import { ensureUserTheme } from '../../../lib/server/userPreferenceService';
import { POST } from './route';

vi.mock('../../../lib/server/auth', () => ({
  createSessionToken: vi.fn(() => 'login-test-token'),
  loginUser: vi.fn()
}));

vi.mock('../../../lib/server/auditService', () => ({
  writeAudit: vi.fn(async () => undefined)
}));

vi.mock('../../../lib/server/userPreferenceService', () => ({
  ensureUserTheme: vi.fn(),
  isAppTheme: (value: unknown) => value === 'modern-dark' || value === 'modern-light'
}));

const loginUserMock = vi.mocked(loginUser);
const writeAuditMock = vi.mocked(writeAudit);
const ensureUserThemeMock = vi.mocked(ensureUserTheme);

const createLoginRequest = (theme: string) => new NextRequest('http://localhost/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ uid: 'A001', pwd: 'password', theme })
});

describe('一般登入 Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loginUserMock.mockResolvedValue({
      id: 'A001',
      name: '測試使用者',
      role: 'USER',
      dept_id: '',
      dept_name: '',
      position: ''
    });
  });

  it('首次設定使用登入畫面主題', async () => {
    ensureUserThemeMock.mockResolvedValue('modern-light');
    const response = await POST(createLoginRequest('modern-light'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(ensureUserThemeMock).toHaveBeenCalledWith('A001', 'modern-light');
    expect(payload.data.theme).toBe('modern-light');
    expect(response.headers.get('set-cookie')).toContain('dms_session=');
  });

  it('回傳既有使用者設定，不以登入畫面選擇覆寫', async () => {
    ensureUserThemeMock.mockResolvedValue('modern-dark');
    const response = await POST(createLoginRequest('modern-light'));
    const payload = await response.json();

    expect(payload.data.theme).toBe('modern-dark');
    expect(writeAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'AUTH_LOGIN_SUCCESS'
    }));
  });

  it('拒絕不支援的佈景主題且不驗證帳密', async () => {
    const response = await POST(createLoginRequest('unknown-theme'));

    expect(response.status).toBe(400);
    expect(loginUserMock).not.toHaveBeenCalled();
    expect(ensureUserThemeMock).not.toHaveBeenCalled();
  });
});
