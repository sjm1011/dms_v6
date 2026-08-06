import { NextRequest } from 'next/server';
import { requireSession } from '../../../../lib/server/auth';
import { fail, ok, parseJsonBody, systemRouteError } from '../../../../lib/server/http';
import { getFolderManagerInfo, updateFolderManagers } from '../../../../lib/server/folderService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const folderId = Number(request.nextUrl.searchParams.get('fid') || 0);
    const includeEmployeeIds = request.nextUrl.searchParams.get('include_employee_ids') === '1';
    const assignmentType = request.nextUrl.searchParams.get('assignment_type') === 'PRIMARY'
      ? 'PRIMARY'
      : 'CO_MANAGER';
    const response = ok(await getFolderManagerInfo(session.user, folderId, includeEmployeeIds, assignmentType));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === '沒有此資料夾的管理權限。') {
      return fail(error.message, 403);
    }

    return systemRouteError(error);
  }
};

export const PUT = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const body = await parseJsonBody<{
      folder_id: number;
      assignment_type: 'PRIMARY' | 'CO_MANAGER';
      managers: string[];
    }>(request);
    if (body.assignment_type !== 'PRIMARY' && body.assignment_type !== 'CO_MANAGER') {
      return fail('管理員指派類型不正確。', 400);
    }
    await updateFolderManagers(
      session.user,
      Number(body.folder_id),
      body.assignment_type,
      Array.isArray(body.managers) ? body.managers : []
    );
    return ok(null);
  } catch (error) {
    return systemRouteError(error);
  }
};
