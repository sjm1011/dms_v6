import { NextRequest } from 'next/server';
import { requireSession } from '../../../lib/server/auth';
import { authOrServerError, fail, ok, parseJsonBody, systemRouteError } from '../../../lib/server/http';
import {
  archiveFolder,
  createFolder,
  deleteEmptyFolder,
  getFolderAccessStatus,
  listFolders,
  updateFolder
} from '../../../lib/server/folderService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const folderId = request.nextUrl.searchParams.get('access_fid');
    if (folderId !== null) {
      return ok(await getFolderAccessStatus(session.user, Number(folderId)));
    }
    return ok(await listFolders(session.user));
  } catch (error) {
    return authOrServerError(error);
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const body = await parseJsonBody<{ name: string; parent_id?: number; managers?: string[] }>(request);
    return ok(await createFolder(session.user, body.name, body.parent_id, body.managers), 201);
  } catch (error) {
    return systemRouteError(error);
  }
};

export const PUT = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const body = await parseJsonBody<{ id: number; name: string; managers?: string[] }>(request);
    await updateFolder(session.user, Number(body.id), body.name);
    return ok(null);
  } catch (error) {
    return systemRouteError(error);
  }
};

export const DELETE = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const body = await parseJsonBody<{ id: number; action?: string }>(request);

    if (body.action === 'delete') {
      await deleteEmptyFolder(session.user, Number(body.id));
    } else {
      await archiveFolder(session.user, Number(body.id));
    }

    return ok(null);
  } catch (error) {
    return systemRouteError(error);
  }
};
