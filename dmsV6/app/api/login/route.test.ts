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
  ensureUserTheme: vi.fn()
}));

const loginUserMock = vi.mocked(loginUser);
const writeAuditMock = vi.mocked(writeAudit);
const ensureUserThemeMock = vi.mocked(ensureUserTheme);

const createLoginRequest = (extraBody: Record<string, unknown> = {}) => new NextRequest('http://localhost/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ uid: 'A001', pwd: 'password', ...extraBody })
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

  it('首次設定固定使用柔和佈景主題', async () => {
    ensureUserThemeMock.mockResolvedValue('soft-warm');
    const response = await POST(createLoginRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(ensureUserThemeMock).toHaveBeenCalledWith('A001', 'soft-warm');
    expect(payload.data.theme).toBe('soft-warm');
    expect(response.headers.get('set-cookie')).toContain('dms_session=');
  });

  it('回傳既有使用者設定且不以首次預設值覆寫', async () => {
    ensureUserThemeMock.mockResolvedValue('modern-dark');
    const response = await POST(createLoginRequest());
    const payload = await response.json();

    expect(payload.data.theme).toBe('modern-dark');
    expect(writeAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'AUTH_LOGIN_SUCCESS'
    }));
  });

  it('忽略舊呼叫額外傳入的佈景主題欄位', async () => {
    ensureUserThemeMock.mockResolvedValue('soft-warm');
    const response = await POST(createLoginRequest({ theme: 'unknown-theme' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(loginUserMock).toHaveBeenCalledWith('A001', 'password');
    expect(ensureUserThemeMock).toHaveBeenCalledWith('A001', 'soft-warm');
    expect(payload.data.theme).toBe('soft-warm');
  });
});
