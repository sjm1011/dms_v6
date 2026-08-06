import { NextRequest } from 'next/server';
import { requireSession } from '../../../lib/server/auth';
import { fail, ok, parseJsonBody, systemRouteError } from '../../../lib/server/http';
import {
  cancelLatestVersion,
  deleteFirstVersionDocument,
  deleteScheduledVersion,
  editDocument,
  listDocuments,
  moveDocument
} from '../../../lib/server/documentService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const folderId = Number(request.nextUrl.searchParams.get('folder_id') || 0);

    return ok(await listDocuments(session.user, folderId));
  } catch (error) {
    return systemRouteError(error);
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const body = await parseJsonBody<any>(request);

    if (body.action === 'edit_document') {
      if (body.source_file) return fail('原始編修檔必須使用檔案上傳端點。', 415);
      await editDocument(session.user, body);
      return ok(null);
    }

    if (body.action === 'cancel_latest_version') {
      await cancelLatestVersion(session.user, Number(body.doc_id), body.reason || '');
      return ok(null);
    }

    if (body.action === 'create' || body.action === 'upload_version' || body.action === 'obsolete') {
      return fail('此操作必須使用檔案上傳端點。', 415);
    }

    if (body.action === 'delete_document') {
      await deleteFirstVersionDocument(session.user, Number(body.doc_id));
      return ok(null);
    }

    if (body.action === 'delete_scheduled_version') {
      await deleteScheduledVersion(
        session.user,
        Number(body.doc_id),
        Number(body.version_id)
      );
      return ok(null);
    }

    if (body.action === 'move_document') {
      return ok(await moveDocument(
        session.user,
        Number(body.doc_id),
        Number(body.destination_folder_id)
      ));
    }

    return fail('不支援的文件操作。', 400);
  } catch (error) {
    return systemRouteError(error);
  }
};
