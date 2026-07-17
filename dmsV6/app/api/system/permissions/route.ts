import { NextRequest } from 'next/server';
import { requireAdmin, requireSession } from '../../../../lib/server/auth';
import { ok, systemRouteError } from '../../../../lib/server/http';
import { listPermissionOverview } from '../../../../lib/server/systemService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    requireAdmin(requireSession(request).user);
    return ok(await listPermissionOverview());
  } catch (error) {
    return systemRouteError(error);
  }
};
