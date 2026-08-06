import { describe, expect, it } from 'vitest';
import { getWatermarkFont } from './pdfWatermark';

describe('PDF 水印字型快取', () => {
  it('同一執行個體重複呼叫時共用載入 Promise', async () => {
    const first = getWatermarkFont();
    const second = getWatermarkFont();
    expect(first).toBe(second);
    await expect(first).resolves.toBeDefined();
  });
});
