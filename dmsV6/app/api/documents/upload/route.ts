import { NextRequest } from 'next/server';
import { requireSession } from '../../../../lib/server/auth';
import {
  createDocument,
  editDocument,
  obsoleteDocument,
  uploadVersion
} from '../../../../lib/server/documentService';
import { cleanupMultipartUpload, acquireUploadSlot, parseMultipartUpload, UploadHttpError } from '../../../../lib/server/multipartUpload';
import { fail, ok } from '../../../../lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supportedActions = new Set(['create', 'upload_version', 'edit_document', 'obsolete']);

export const POST = async (request: NextRequest) => {
  let releaseUploadSlot: (() => void) | null = null;
  let upload: Awaited<ReturnType<typeof parseMultipartUpload>> | null = null;

  try {
    const session = requireSession(request);
    const action = request.nextUrl.searchParams.get('action') || '';
    if (!supportedActions.has(action)) return fail('不支援的檔案上傳操作。', 400);

    releaseUploadSlot = acquireUploadSlot();
    upload = await parseMultipartUpload(request);
    const payload = {
      ...upload.metadata,
      file: upload.file,
      source_file: upload.sourceFile
    };

    if ((action === 'create' || action === 'upload_version' || action === 'obsolete') && !upload.file) {
      return fail('此操作缺少必要的正式檔案。', 400);
    }

    if (action === 'create') {
      return ok(await createDocument(session.user, payload as unknown as Parameters<typeof createDocument>[1]), 201);
    }
    if (action === 'upload_version') {
      await uploadVersion(session.user, payload as unknown as Parameters<typeof uploadVersion>[1]);
      return ok(null);
    }
    if (action === 'edit_document') {
      if (!upload.sourceFile) return fail('修改原始編修檔時缺少來源檔案。', 400);
      await editDocument(session.user, payload as unknown as Parameters<typeof editDocument>[1]);
      return ok(null);
    }

    await obsoleteDocument(
      session.user,
      Number(upload.metadata.doc_id),
      String(upload.metadata.reason || ''),
      upload.file!
    );
    return ok(null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof UploadHttpError
      ? error.status
      : message === '尚未登入或登入狀態已失效。'
        ? 401
        : message.includes('沒有') || message.includes('只有')
          ? 403
          : 400;
    const response = fail(message, status);
    if (status === 503) response.headers.set('Retry-After', '5');
    return response;
  } finally {
    if (upload) await cleanupMultipartUpload(upload);
    releaseUploadSlot?.();
  }
};
