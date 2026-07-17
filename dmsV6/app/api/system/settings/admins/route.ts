import { NextRequest } from 'next/server';
import { requireAdmin, requireSession } from '../../../../../lib/server/auth';
import { ok, parseJsonBody, systemRouteError } from '../../../../../lib/server/http';
import { assignSystemAdmin, listSystemAdmins, revokeSystemAdmin } from '../../../../../lib/server/systemService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    requireAdmin(requireSession(request).user);
    return ok(await listSystemAdmins());
  } catch (error) {
    return systemRouteError(error);
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    requireAdmin(session.user);
    const body = await parseJsonBody<{ employee_id?: string }>(request);
    await assignSystemAdmin(session.user, body.employee_id || '');
    return ok(null);
  } catch (error) {
    return systemRouteError(error);
  }
};

export const DELETE = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    requireAdmin(session.user);
    const body = await parseJsonBody<{ employee_id?: string }>(request);
    await revokeSystemAdmin(session.user, body.employee_id || '');
    return ok(null);
  } catch (error) {
    return systemRouteError(error);
  }
};
