import { NextRequest } from 'next/server';
import { requireSession } from '../../../lib/server/auth';
import { getDashboardData } from '../../../lib/server/dashboardService';
import { authOrServerError, ok } from '../../../lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const response = ok(await getDashboardData(session.user));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return authOrServerError(error);
  }
};
