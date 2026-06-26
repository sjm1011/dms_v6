import { NextRequest } from 'next/server';
import { requireSession } from '../../../../lib/server/auth';
import { fail, ok, parseJsonBody, serverError } from '../../../../lib/server/http';
import { getFolderAcl, updateFolderAcl } from '../../../../lib/server/folderService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const fid = Number(request.nextUrl.searchParams.get('fid') || 0);

    return ok(await getFolderAcl(session.user, fid));
  } catch (error) {
    return error instanceof Error ? fail(error.message, 400) : serverError(error);
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const body = await parseJsonBody<{
      id: number;
      access_type: number;
      dept_ids: string[];
      uids: string[];
    }>(request);

    await updateFolderAcl(
      session.user,
      Number(body.id),
      Number(body.access_type),
      body.dept_ids || [],
      body.uids || []
    );

    return ok(null);
  } catch (error) {
    return error instanceof Error ? fail(error.message, 400) : serverError(error);
  }
};
