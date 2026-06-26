import { NextRequest } from 'next/server';
import { requireSession } from '../../../lib/server/auth';
import { authOrServerError, ok } from '../../../lib/server/http';
import { listDepartments } from '../../../lib/server/employeeService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    requireSession(request);
    return ok(await listDepartments());
  } catch (error) {
    return authOrServerError(error);
  }
};
