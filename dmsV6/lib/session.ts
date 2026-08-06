import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import type { User } from '../types';

export type SessionUser = Omit<User, 'token'>;

export interface SessionPayload {
  token: string;
  user: SessionUser;
  issuedAt: number;
}

const DEFAULT_SESSION_COOKIE_NAME = 'dms_session';
const DEFAULT_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const DEFAULT_SESSION_SECRET = 'dms-next-dev-session-secret';
const PUBLIC_EXAMPLE_SESSION_SECRET = 'A9228A44-EE18-4713-97C7-FC92A76CB27B';

export const getSessionCookieName = () =>
  process.env.SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE_NAME;

export const assertProductionSessionConfiguration = () => {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = (process.env.SESSION_SECRET || '').trim();
  if (
    secret.length < 32
    || secret === DEFAULT_SESSION_SECRET
    || secret === PUBLIC_EXAMPLE_SESSION_SECRET
    || secret.includes('請改成')
    || secret.includes('至少32字元')
  ) {
    throw new Error('正式環境的 SESSION_SECRET 未設定為至少 32 字元的專用隨機字串。');
  }
};

const getSessionSecret = () => {
  assertProductionSessionConfiguration();
  return process.env.SESSION_SECRET?.trim() || DEFAULT_SESSION_SECRET;
};

const getSessionMaxAgeSeconds = () => {
  const value = Number(process.env.SESSION_MAX_AGE_SECONDS || DEFAULT_SESSION_MAX_AGE_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SESSION_MAX_AGE_SECONDS;
};

const shouldUseSecureCookie = () => process.env.SESSION_COOKIE_SECURE === 'true';

const encodeBase64Url = (value: string) => Buffer.from(value, 'utf8').toString('base64url');

const decodeBase64Url = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

const sign = (value: string) =>
  createHmac('sha256', getSessionSecret()).update(value).digest('base64url');

const verifySignature = (value: string, signature: string) => {
  const expected = sign(value);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
};

export const createSessionCookieValue = (payload: SessionPayload) => {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
};

export const parseSessionCookieValue = (value?: string): SessionPayload | null => {
  if (!value) {
    return null;
  }

  const [encodedPayload, signature] = value.split('.');
  if (!encodedPayload || !signature || !verifySignature(encodedPayload, signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;
    if (!payload.token || !payload.user || !payload.issuedAt) {
      return null;
    }

    if (Date.now() - payload.issuedAt > getSessionMaxAgeSeconds() * 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

export const getSessionFromRequest = (request: NextRequest) =>
  parseSessionCookieValue(request.cookies.get(getSessionCookieName())?.value);

export const toSessionUser = (user: User): SessionUser => {
  const { token: _token, ...sessionUser } = user;
  return sessionUser;
};

export const setSessionCookie = (response: NextResponse, payload: SessionPayload) => {
  response.cookies.set(getSessionCookieName(), createSessionCookieValue(payload), {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(),
    path: '/'
  });
};

export const clearSessionCookie = (response: NextResponse) => {
  response.cookies.set(getSessionCookieName(), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(),
    path: '/',
    maxAge: 0
  });
};
