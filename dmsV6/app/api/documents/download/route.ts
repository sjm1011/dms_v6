import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/server/auth';
import { fail, serverError } from '../../../../lib/server/http';
import { getFileForAccess } from '../../../../lib/server/documentService';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const versionId = request.nextUrl.searchParams.get('version_id') || '';
    const filePurpose = request.nextUrl.searchParams.get('file') === 'source'
      ? 'source'
      : 'published';
    const file = await getFileForAccess(session.user, versionId, 'download', filePurpose);

    return new NextResponse(Readable.toWeb(file.stream) as ReadableStream, {
      status: 200,
      headers: file.headers
    });
  } catch (error) {
    return error instanceof Error ? fail(error.message, 400) : serverError(error);
  }
};
