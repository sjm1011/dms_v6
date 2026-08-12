import { NextRequest } from 'next/server';
import { requireSession } from '../../../../lib/server/auth';
import { authOrServerError, HttpStatusError, ok, parseJsonBody } from '../../../../lib/server/http';
import {
  getUserThemeOrDefault,
  isAppTheme,
  updateUserTheme
} from '../../../../lib/server/userPreferenceService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    return ok({ theme: await getUserThemeOrDefault(session.user.id) });
  } catch (error) {
    return authOrServerError(error);
  }
};

export const PUT = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const body = await parseJsonBody<{ theme?: unknown }>(request);
    if (!isAppTheme(body.theme)) {
      throw new HttpStatusError('佈景主題設定無效。', 400);
    }
    return ok({ theme: await updateUserTheme(session.user.id, body.theme) });
  } catch (error) {
    return authOrServerError(error);
  }
};
