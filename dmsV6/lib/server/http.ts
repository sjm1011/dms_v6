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
  if (error instanceof Error && unauthorizedMessages.has(error.message)) {
    return fail(error.message, 401);
  }

  if (error instanceof Error && forbiddenMessages.has(error.message)) {
    return fail(error.message, 403);
  }

  return serverError(error);
};

export const systemRouteError = (error: unknown) => {
  if (error instanceof Error && unauthorizedMessages.has(error.message)) {
    return fail(error.message, 401);
  }
  if (error instanceof Error && forbiddenMessages.has(error.message)) {
    return fail(error.message, 403);
  }
  return fail(error instanceof Error ? error.message : String(error), 400);
};

export const parseJsonBody = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error('JSON 格式錯誤。');
  }
};
