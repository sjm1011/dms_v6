// Next.js 階段由 /api/* Route Handlers 對內轉發後端 API。
const configBaseUrl = '/api';

export const API_BASE = configBaseUrl.replace(/\/$/, '');

// 登入憑證由 Next.js HttpOnly Cookie 管理，瀏覽器端不持有 token。
export const getAuthHeader = (): Record<string, string> => {
  return {};
};

const DEFAULT_API_TIMEOUT_MS = 15_000;

// 所有清單 API 都必須有明確逾時，避免網路或後端停滯時畫面永久維持載入狀態。
export const apiFetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS
) => {
  const controller = new AbortController();
  const externalSignal = init.signal;
  let didTimeout = false;

  const handleExternalAbort = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', handleExternalAbort, { once: true });
  }

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (didTimeout) {
      throw new Error(`伺服器在 ${Math.ceil(timeoutMs / 1000)} 秒內未回應，請重新整理或稍後再試。`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', handleExternalAbort);
  }
};

// 統一連線與錯誤回應攔截器
export const handleResponse = async (response: Response): Promise<any> => {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP 錯誤狀態碼: ${response.status}\n回應內容 (Body)：\n${text}`);
  }

  if (response.status === 204 || !text.trim()) {
    return { success: true, data: null };
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`JSON 解析失敗 (可能回傳了非 JSON 格式，例如 HTML)。\nHTTP 狀態碼: ${response.status}\n回應內容 (Body)：\n${text}`);
    }
  }

  return { success: true, data: text };
};
