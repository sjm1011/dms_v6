import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, setSessionCookie, toSessionUser } from '../../lib/session';
import { createSessionToken, loginUser } from '../../lib/server/auth';
import { writeAudit } from '../../lib/server/auditService';
import { fail, HttpStatusError, parseUrlEncodedBody } from '../../lib/server/http';
import { ensureUserTheme } from '../../lib/server/userPreferenceService';

export const dynamic = 'force-dynamic';

const redirectToHome = (errorCode?: string) => {
  const location = errorCode
    ? `/?external_login_error=${encodeURIComponent(errorCode)}`
    : '/';

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer'
    }
  });
};

const auditFailure = async (attemptedUid: string, reason: string) => {
  await writeAudit({
    actorUid: attemptedUid || null,
    action: 'AUTH_LOGIN_FAILED',
    resourceType: 'AUTH',
    result: 'FAILED',
    reason,
    metadata: { login_method: 'EXTERNAL_POST' }
  });
};

export const POST = async (request: NextRequest) => {
  let attemptedUid = '';

  try {
    const form = await parseUrlEncodedBody(request);
    attemptedUid = String(form.get('uid') || '').trim().toUpperCase();
    const password = String(form.get('pwd') || '');

    if (!attemptedUid || !password) {
      await auditFailure(attemptedUid, '請輸入帳號與密碼。');
      const response = redirectToHome('missing_credentials');
      clearSessionCookie(response);
      return response;
    }

    const user = await loginUser(attemptedUid, password);
    const sessionUser = toSessionUser(user);
    await ensureUserTheme(sessionUser.id, 'soft-warm');
    const response = redirectToHome();

    setSessionCookie(response, {
      token: createSessionToken(),
      user: sessionUser,
      issuedAt: Date.now()
    });
    await writeAudit({
      user: sessionUser,
      action: 'AUTH_LOGIN_SUCCESS',
      resourceType: 'AUTH',
      metadata: { login_method: 'EXTERNAL_POST' }
    });

    return response;
  } catch (error) {
    if (error instanceof HttpStatusError) {
      return fail(error.message, error.status);
    }

    const reason = error instanceof Error ? error.message : String(error);
    await auditFailure(attemptedUid, reason);
    const errorCode = reason === '帳號或密碼錯誤。'
      ? 'invalid_credentials'
      : 'server_error';
    const response = redirectToHome(errorCode);
    clearSessionCookie(response);
    return response;
  }
};
