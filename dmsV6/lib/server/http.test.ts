import { describe, expect, it } from 'vitest';
import { HttpStatusError, parseJsonBody } from './http';

describe('JSON Request Body 上限', () => {
  it('解析限制內的 JSON', async () => {
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ value: 'ok' })
    });

    await expect(parseJsonBody<{ value: string }>(request, 1024)).resolves.toEqual({ value: 'ok' });
  });

  it('依實際串流位元組數拒絕超限內容', async () => {
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ value: 'x'.repeat(2048) })
    });

    try {
      await parseJsonBody(request, 1024);
      throw new Error('超限 JSON 不應解析成功。');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpStatusError);
      expect((error as HttpStatusError).status).toBe(413);
    }
  });
});
