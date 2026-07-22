import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookie, toSessionUser } from '../../../lib/session';
import { createSessionToken, loginUser } from '../../../lib/server/auth';
import { authOrServerError, ok, parseJsonBody } from '../../../lib/server/http';
import { writeAudit } from '../../../lib/server/auditService';

export const dynamic = 'force-dynamic';

export const POST = async (request: NextRequest) => {
  let attemptedUid = '';
  try {
    const body = await parseJsonBody<{ uid: string; pwd: string }>(request);
    attemptedUid = String(body.uid || '').trim().toUpperCase();
    const user = await loginUser(body.uid, body.pwd);
    const sessionUser = toSessionUser(user);
    const response = ok(sessionUser);

    setSessionCookie(response, {
      token: createSessionToken(),
      user: sessionUser,
      issuedAt: Date.now()
    });
    await writeAudit({
      user: sessionUser,
      action: 'AUTH_LOGIN_SUCCESS',
      resourceType: 'AUTH'
    });

    return response;
  } catch (error) {
    await writeAudit({
      actorUid: attemptedUid || null,
      action: 'AUTH_LOGIN_FAILED',
      resourceType: 'AUTH',
      result: 'FAILED',
      reason: error instanceof Error ? error.message : String(error)
    });

    return authOrServerError(error);
  }
};
