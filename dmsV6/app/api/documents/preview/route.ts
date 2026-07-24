import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/server/auth';
import { fail, serverError } from '../../../../lib/server/http';
import { getFileForAccess } from '../../../../lib/server/documentService';
import { applyPdfWatermark } from '../../../../lib/server/pdfWatermark';
import { getClientIp } from '../../../../lib/server/request';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const session = requireSession(request);
    const versionId = request.nextUrl.searchParams.get('version_id') || '';
    const file = await getFileForAccess(session.user, versionId, 'preview');

    if (file.row.dfi_ext.toLowerCase() === 'pdf') {
      const chunks: Buffer[] = [];

      for await (const chunk of file.stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const watermarkedPdf = await applyPdfWatermark(Buffer.concat(chunks), {
        userText: `${session.user.name || ''} ${session.user.id || ''}`.trim(),
        clientIp: getClientIp(request),
        documentCode: file.row.dd_code,
        documentName: file.row.dd_title
      });
      const headers = new Headers(file.headers);
      headers.set('content-length', String(watermarkedPdf.byteLength));
      headers.set('content-type', 'application/pdf');

      return new NextResponse(new Uint8Array(watermarkedPdf), {
        status: 200,
        headers
      });
    }

    return new NextResponse(Readable.toWeb(file.stream) as ReadableStream, {
      status: 200,
      headers: file.headers
    });
  } catch (error) {
    return error instanceof Error ? fail(error.message, 400) : serverError(error);
  }
};
