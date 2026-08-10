import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { loginUser } from '../../lib/server/auth';
import { writeAudit } from '../../lib/server/auditService';
import { POST } from './route';

vi.mock('../../lib/server/auth', () => ({
  createSessionToken: vi.fn(() => 'external-login-test-token'),
  loginUser: vi.fn()
}));

vi.mock('../../lib/server/auditService', () => ({
  writeAudit: vi.fn(async () => undefined)
}));

const loginUserMock = vi.mocked(loginUser);
const writeAuditMock = vi.mocked(writeAudit);

const createFormRequest = (uid: string, pwd: string) => new NextRequest(
  'http://localhost/external-login',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ uid, pwd }).toString()
  }
);

describe('外部網站自動登入 Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('有效帳密建立 Session 並導向固定首頁', async () => {
    loginUserMock.mockResolvedValue({
      id: 'A001',
      name: '測試使用者',
      role: 'USER',
      dept_id: '',
      dept_name: '',
      position: ''
    });

    const response = await POST(createFormRequest('a001', 'password'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(response.headers.get('set-cookie')).toContain('dms_session=');
    expect(response.headers.get('set-cookie')).not.toContain('Max-Age=0');
    expect(loginUserMock).toHaveBeenCalledWith('A001', 'password');
    expect(writeAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'AUTH_LOGIN_SUCCESS',
      metadata: { login_method: 'EXTERNAL_POST' }
    }));
  });

  it('帳密錯誤清除 Session 並導向固定錯誤代碼', async () => {
    loginUserMock.mockRejectedValue(new Error('帳號或密碼錯誤。'));

    const response = await POST(createFormRequest('A001', 'wrong-password'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/?external_login_error=invalid_credentials');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(writeAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      actorUid: 'A001',
      action: 'AUTH_LOGIN_FAILED',
      metadata: { login_method: 'EXTERNAL_POST' }
    }));
  });

  it('欄位缺漏時不查詢使用者並清除 Session', async () => {
    const response = await POST(createFormRequest('', ''));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/?external_login_error=missing_credentials');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(loginUserMock).not.toHaveBeenCalled();
  });

  it('拒絕 JSON 格式且不變更 Session', async () => {
    const response = await POST(new NextRequest('http://localhost/external-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }));

    expect(response.status).toBe(415);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(loginUserMock).not.toHaveBeenCalled();
  });
});
