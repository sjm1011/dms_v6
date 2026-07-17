import { NextRequest } from 'next/server';
import { requireAdmin, requireSession } from '../../../../lib/server/auth';
import { ok, parseJsonBody, systemRouteError } from '../../../../lib/server/http';
import { listRecycleBatches, purgeArchivedBatch, restoreArchivedBatch, retryPurgeCleanup } from '../../../../lib/server/systemService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    requireAdmin(requireSession(request).user);
    return ok(await listRecycleBatches());
  } catch (error) {
    return systemRouteError(error);
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    requireAdmin(session.user);
    const body = await parseJsonBody<{ action?: string; folder_id?: number; job_id?: number; confirmation_name?: string }>(request);
    if (body.action === 'restore') {
      await restoreArchivedBatch(session.user, Number(body.folder_id));
      return ok(null);
    }
    if (body.action === 'purge') {
      return ok(await purgeArchivedBatch(session.user, Number(body.folder_id), body.confirmation_name || ''));
    }
    if (body.action === 'retry_cleanup') {
      await retryPurgeCleanup(Number(body.job_id));
      return ok(null);
    }
    throw new Error('不支援的資源回收區操作。');
  } catch (error) {
    return systemRouteError(error);
  }
};
