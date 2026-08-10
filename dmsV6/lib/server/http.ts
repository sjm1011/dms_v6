import { NextResponse } from 'next/server';

export const ok = <T>(data: T, status = 200) =>
  NextResponse.json(
    {
      success: true,
      data,
      error: ''
    },
    { status }
  );

export const fail = (error: string, status = 400, data: unknown = null) =>
  NextResponse.json(
    {
      success: false,
      data,
      error
    },
    { status }
  );

export class HttpStatusError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const serverError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  return fail(`伺服器處理失敗：${message}`, 500);
};

const unauthorizedMessages = new Set([
  '尚未登入或登入狀態已失效。',
  '帳號或密碼錯誤。'
]);

const forbiddenMessages = new Set([
  '只有系統管理員可以使用此功能。',
  '只有系統管理員、資料夾管理員或協同管理員可以使用此功能。'
]);

export const authOrServerError = (error: unknown) => {
  if (error instanceof HttpStatusError) return fail(error.message, error.status);
  if (error instanceof Error && unauthorizedMessages.has(error.message)) {
    return fail(error.message, 401);
  }

  if (error instanceof Error && forbiddenMessages.has(error.message)) {
    return fail(error.message, 403);
  }

  return serverError(error);
};

export const systemRouteError = (error: unknown) => {
  if (error instanceof HttpStatusError) return fail(error.message, error.status);
  if (error instanceof Error && unauthorizedMessages.has(error.message)) {
    return fail(error.message, 401);
  }
  if (error instanceof Error && forbiddenMessages.has(error.message)) {
    return fail(error.message, 403);
  }
  return fail(error instanceof Error ? error.message : String(error), 400);
};

export const parseJsonBody = async <T>(request: Request, maxBytes = 1024 * 1024): Promise<T> => {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpStatusError('JSON 請求內容超過 1 MiB 限制。', 413);
  }

  try {
    if (!request.body) throw new Error('empty');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpStatusError('JSON 請求內容超過 1 MiB 限制。', 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    chunks.forEach((chunk) => {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    });
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T;
  } catch (error) {
    if (error instanceof HttpStatusError) throw error;
    throw new Error('JSON 格式錯誤。');
  }
};

export const parseUrlEncodedBody = async (request: Request, maxBytes = 8 * 1024) => {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/x-www-form-urlencoded') {
    throw new HttpStatusError('只接受 application/x-www-form-urlencoded 格式。', 415);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpStatusError('表單內容超過 8 KiB 限制。', 413);
  }

  if (!request.body) {
    return new URLSearchParams();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpStatusError('表單內容超過 8 KiB 限制。', 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });

  try {
    return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new HttpStatusError('表單內容不是有效的 UTF-8 格式。', 400);
  }
};
