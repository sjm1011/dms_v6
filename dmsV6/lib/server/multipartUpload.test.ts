import { describe, expect, it } from 'vitest';
import {
  acquireUploadSlot,
  cleanupMultipartUpload,
  parseMultipartUpload,
  UploadHttpError
} from './multipartUpload';

describe('上傳併發限制', () => {
  it('只允許同時 2 筆並在釋放後恢復', () => {
    const releaseFirst = acquireUploadSlot();
    const releaseSecond = acquireUploadSlot();
    try {
      acquireUploadSlot();
      throw new Error('第 3 筆上傳不應取得名額。');
    } catch (error) {
      expect(error).toBeInstanceOf(UploadHttpError);
      expect((error as UploadHttpError).status).toBe(503);
    }
    releaseFirst();
    const releaseThird = acquireUploadSlot();
    releaseSecond();
    releaseThird();
  });
});

describe('multipart 串流解析', () => {
  it('解析中繼資料及正式檔案，不產生 Base64', async () => {
    const form = new FormData();
    form.append('metadata', JSON.stringify({ doc_id: '1' }));
    form.append('file', new Blob(['%PDF-1.7\ncontent'], { type: 'application/pdf' }), 'test.pdf');
    const request = new Request('http://localhost/api/documents/upload?action=obsolete', {
      method: 'POST',
      body: form
    });

    const upload = await parseMultipartUpload(request);
    try {
      expect(upload.metadata).toEqual({ doc_id: '1' });
      expect(upload.file).toMatchObject({ name: 'test.pdf', mime: 'application/pdf' });
      expect(upload.file).not.toHaveProperty('base64');
    } finally {
      await cleanupMultipartUpload(upload);
    }
  });

  it('拒絕非物件的中繼資料', async () => {
    const form = new FormData();
    form.append('metadata', '[]');
    const request = new Request('http://localhost/api/documents/upload?action=edit_document', {
      method: 'POST',
      body: form
    });

    await expect(parseMultipartUpload(request)).rejects.toMatchObject({ status: 400 });
  });

  it('拒絕第 3 個檔案', async () => {
    const form = new FormData();
    form.append('metadata', JSON.stringify({ doc_id: '1' }));
    form.append('file', new Blob(['%PDF-1.7\na'], { type: 'application/pdf' }), 'a.pdf');
    form.append('source_file', new Blob(['%PDF-1.7\nb'], { type: 'application/pdf' }), 'b.pdf');
    form.append('file', new Blob(['%PDF-1.7\nc'], { type: 'application/pdf' }), 'c.pdf');
    const request = new Request('http://localhost/api/documents/upload?action=obsolete', {
      method: 'POST',
      body: form
    });

    await expect(parseMultipartUpload(request)).rejects.toMatchObject({ status: 400 });
  });
});
