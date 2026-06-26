import { NextRequest } from 'next/server';
import { requireSession } from '../../../lib/server/auth';
import { ok, fail } from '../../../lib/server/http';
import { query } from '../../../lib/server/db';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const result = await query<{ now: string }>('SELECT CURRENT_TIMESTAMP::text AS now');

    return ok({
      user: session.user,
      database_time: result.rows[0]?.now || ''
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 500);
  }
};
