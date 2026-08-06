import { afterEach, describe, expect, it } from 'vitest';
import {
  assertProductionSessionConfiguration,
  createSessionCookieValue,
  parseSessionCookieValue
} from './session';

const originalNodeEnv = process.env.NODE_ENV;
const originalSessionSecret = process.env.SESSION_SECRET;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSessionSecret;
});

describe('正式環境 Session Secret', () => {
  it.each([
    '',
    'short-secret',
    'dms-next-dev-session-secret',
    'A9228A44-EE18-4713-97C7-FC92A76CB27B',
    '請改成至少32字元且只供此正式環境使用的隨機字串'
  ])('拒絕不安全值：%s', (secret) => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = secret;
    expect(() => assertProductionSessionConfiguration()).toThrow(/SESSION_SECRET/);
  });

  it('接受至少 32 字元的正式環境專用值', () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'valid-production-secret-0123456789-abcdef';
    expect(() => assertProductionSessionConfiguration()).not.toThrow();
    const payload = {
      token: 'test-token',
      user: {
        id: 'U001',
        name: '測試人員',
        role: 'USER',
        dept_id: 'D001',
        dept_name: '測試部門',
        position: '測試職稱'
      },
      issuedAt: Date.now()
    };
    expect(parseSessionCookieValue(createSessionCookieValue(payload))).toEqual(payload);
  });

  it('開發環境允許使用預設值', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SESSION_SECRET;
    expect(() => assertProductionSessionConfiguration()).not.toThrow();
  });
});
