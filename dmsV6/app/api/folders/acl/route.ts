import { NextRequest } from 'next/server';
import { requireSession } from '../../../../lib/server/auth';
import { ok, parseJsonBody, systemRouteError } from '../../../../lib/server/http';
import { getFolderAcl, updateFolderAcl } from '../../../../lib/server/folderService';
import type { FolderAccessType } from '../../../../types';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const fid = Number(request.nextUrl.searchParams.get('fid') || 0);

    const response = ok(await getFolderAcl(session.user, fid));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return systemRouteError(error);
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const body = await parseJsonBody<{
      id: number;
      access_type: FolderAccessType;
      dept_ids: string[];
      uids: string[];
    }>(request);

    await updateFolderAcl(
      session.user,
      Number(body.id),
      Number(body.access_type) as FolderAccessType,
      Array.isArray(body.dept_ids) ? body.dept_ids : [],
      Array.isArray(body.uids) ? body.uids : []
    );

    return ok(null);
  } catch (error) {
    return systemRouteError(error);
  }
};
