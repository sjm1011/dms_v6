import { NextRequest } from 'next/server';
import { requireSession } from '../../../lib/server/auth';
import { fail, ok, parseJsonBody, serverError } from '../../../lib/server/http';
import {
  cancelLatestVersion,
  createDocument,
  deleteFirstVersionDocument,
  deleteScheduledVersion,
  editDocument,
  listDocuments,
  moveDocument,
  obsoleteDocument,
  uploadVersion
} from '../../../lib/server/documentService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const folderId = Number(request.nextUrl.searchParams.get('folder_id') || 0);

    return ok(await listDocuments(session.user, folderId));
  } catch (error) {
    return error instanceof Error ? fail(error.message, 400) : serverError(error);
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const body = await parseJsonBody<any>(request);

    if (body.action === 'create') {
      return ok(await createDocument(session.user, body), 201);
    }

    if (body.action === 'upload_version') {
      await uploadVersion(session.user, body);
      return ok(null);
    }

    if (body.action === 'edit_document') {
      await editDocument(session.user, body);
      return ok(null);
    }

    if (body.action === 'cancel_latest_version') {
      await cancelLatestVersion(session.user, Number(body.doc_id), body.reason || '');
      return ok(null);
    }

    if (body.action === 'obsolete') {
      await obsoleteDocument(session.user, Number(body.doc_id), body.reason || '', body.file);
      return ok(null);
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
    return error instanceof Error ? fail(error.message, 400) : serverError(error);
  }
};
