import { NextRequest } from 'next/server';
import { requireSession } from '../../../lib/server/auth';
import { fail, ok, serverError } from '../../../lib/server/http';
import { searchDocuments } from '../../../lib/server/searchService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const params = request.nextUrl.searchParams;
    const scope = params.get('scope') === 'all' ? 'all' : 'current';
    const folderId = Number(params.get('folder_id') || 0);
    const page = Number(params.get('page') || 1);
    const pageSize = Number(params.get('page_size') || 50);

    if (!Number.isSafeInteger(folderId) || folderId < 0) {
      return fail('搜尋範圍的資料夾識別碼不正確。', 400);
    }
    if (!Number.isSafeInteger(page) || page < 1) {
      return fail('搜尋頁碼不正確。', 400);
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return fail('每頁筆數必須介於 1 到 100。', 400);
    }

    return ok(await searchDocuments(session.user, {
      keyword: params.get('keyword') || '',
      scope,
      folderId,
      page,
      pageSize
    }));
  } catch (error) {
    return error instanceof Error ? fail(error.message, 400) : serverError(error);
  }
};
