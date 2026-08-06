import { NextRequest } from 'next/server';
import { requireSession } from '../../../../../lib/server/auth';
import { markAnnouncementRead } from '../../../../../lib/server/dashboardService';
import { fail, ok, parseJsonBody, systemRouteError } from '../../../../../lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const body = await parseJsonBody<{ announcement_id?: number; revision?: number }>(request);
    await markAnnouncementRead(
      session.user,
      Number(body.announcement_id),
      Number(body.revision)
    );
    return ok(null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === '無權存取此公告。') return fail(message, 403);
    if (message === '公告版次已變更，請重新載入後再確認。') return fail(message, 409);
    return systemRouteError(error);
  }
};
