import { NextRequest } from 'next/server';
import { requireAuditAccess, requireSession } from '../../../../lib/server/auth';
import { ok, systemRouteError } from '../../../../lib/server/http';
import { listAuditLogs } from '../../../../lib/server/systemService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    await requireAuditAccess(session.user);
    const q = request.nextUrl.searchParams;
    const response = ok(await listAuditLogs(session.user, {
      dateFrom: q.get('date_from') || undefined,
      dateTo: q.get('date_to') || undefined,
      actor: q.get('actor') || undefined,
      action: q.get('action') || undefined,
      result: q.get('result') || undefined,
      keyword: q.get('keyword') || undefined,
      page: Number(q.get('page') || 1),
      pageSize: Number(q.get('page_size') || 50)
    }));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return systemRouteError(error);
  }
};
