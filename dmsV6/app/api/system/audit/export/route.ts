import { NextRequest } from 'next/server';
import { requireAuditAccess, requireSession } from '../../../../../lib/server/auth';
import { systemRouteError } from '../../../../../lib/server/http';
import { exportAuditCsv } from '../../../../../lib/server/systemService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    await requireAuditAccess(session.user);
    const q = request.nextUrl.searchParams;
    const csv = await exportAuditCsv(session.user, {
      dateFrom: q.get('date_from') || undefined,
      dateTo: q.get('date_to') || undefined,
      actor: q.get('actor') || undefined,
      action: q.get('action') || undefined,
      result: q.get('result') || undefined,
      keyword: q.get('keyword') || undefined
    });
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`系統稽核紀錄_${new Date().toISOString().slice(0, 10)}.csv`)}`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return systemRouteError(error);
  }
};
