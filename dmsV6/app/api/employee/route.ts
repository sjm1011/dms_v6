import { NextRequest } from 'next/server';
import { isAdmin, requireSession } from '../../../lib/server/auth';
import { authOrServerError, fail, ok } from '../../../lib/server/http';
import { getEmployeeByUid } from '../../../lib/server/employeeService';
import { canAssignFolderManagers, canManageFolder } from '../../../lib/server/folderService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const purpose = request.nextUrl.searchParams.get('purpose') || '';
    const folderId = Number(request.nextUrl.searchParams.get('fid') || 0);
    const validPurpose = purpose === 'folder_manager' || purpose === 'folder_acl';

    if (!validPurpose) {
      return fail('此員工查詢用途未經授權。', 403);
    }

    const allowed = folderId > 0
      ? purpose === 'folder_manager'
        ? await canAssignFolderManagers(session.user, folderId)
        : await canManageFolder(session.user, folderId)
      : purpose === 'folder_manager' && isAdmin(session.user);

    if (!allowed) {
      return fail('沒有此資料夾的權限設定權限。', 403);
    }

    const response = ok(await getEmployeeByUid(request.nextUrl.searchParams.get('uid') || ''));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return authOrServerError(error);
  }
};
