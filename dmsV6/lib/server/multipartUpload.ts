import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import busboy from 'busboy';
import {
  cleanupPreparedUploads,
  createUploadInspection,
  getIncomingRoot,
  MAX_UPLOAD_BYTES,
  type UploadPayload
} from './fileStorage';

export const MAX_MULTIPART_BODY_BYTES = 220 * 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_CONCURRENT_UPLOADS = 2;
let activeUploads = 0;

export class UploadHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const acquireUploadSlot = () => {
  if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
    throw new UploadHttpError('系統正在處理其他檔案上傳，請稍後再試。', 503);
  }
  activeUploads += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeUploads = Math.max(0, activeUploads - 1);
  };
};

export interface MultipartUploadResult {
  metadata: Record<string, unknown>;
  file?: UploadPayload;
  sourceFile?: UploadPayload;
  temporaryDirectory: string;
}

export const cleanupMultipartUpload = async (upload: MultipartUploadResult) => {
  await cleanupPreparedUploads([upload.file, upload.sourceFile]);
  await rm(upload.temporaryDirectory, { recursive: true, force: true });
};

export const parseMultipartUpload = async (request: Request): Promise<MultipartUploadResult> => {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    throw new UploadHttpError('檔案上傳必須使用 multipart/form-data。', 415);
  }
  if (!request.body) throw new UploadHttpError('上傳內容不可空白。', 400);

  const temporaryDirectory = path.join(getIncomingRoot(), randomUUID());
  await mkdir(temporaryDirectory, { recursive: true });
  const preparedByField = new Map<string, UploadPayload>();
  const seenFileFields = new Set<string>();
  const fileTasks: Promise<void>[] = [];
  let metadataText = '';
  let parserError: unknown = null;
  let totalBytes = 0;

  const parser = busboy({
    headers: Object.fromEntries(request.headers.entries()),
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 2,
      fields: 1,
      parts: 3,
      fieldSize: MAX_METADATA_BYTES
    }
  });

  parser.on('field', (name, value, info) => {
    if (name !== 'metadata' || info.valueTruncated) {
      parserError = new UploadHttpError('上傳中繼資料格式不正確或超過 64 KiB。', 400);
      return;
    }
    metadataText = value;
  });

  parser.on('fieldsLimit', () => {
    parserError = new UploadHttpError('上傳中繼資料欄位數量超過限制。', 400);
  });

  parser.on('file', (fieldName, stream, info) => {
    if (fieldName !== 'file' && fieldName !== 'source_file') {
      stream.resume();
      parserError = new UploadHttpError('上傳檔案欄位不正確。', 400);
      return;
    }
    if (seenFileFields.has(fieldName)) {
      stream.resume();
      parserError = new UploadHttpError('上傳檔案欄位不可重複。', 400);
      return;
    }
    seenFileFields.add(fieldName);

    const temporaryPath = path.join(temporaryDirectory, `${randomUUID()}.upload`);
    let inspection: ReturnType<typeof createUploadInspection>;
    try {
      inspection = createUploadInspection(info.filename, info.mimeType);
    } catch (error) {
      stream.resume();
      parserError = error;
      return;
    }
    const writer = createWriteStream(temporaryPath, { flags: 'wx' });
    const task = new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        writer.destroy();
        reject(error);
      };
      stream.on('limit', () => fail(new UploadHttpError('正式發佈檔案大小不得超過 100 MB。', 413)));
      stream.on('data', (chunk: Buffer) => {
        try {
          inspection.update(chunk);
        } catch (error) {
          stream.unpipe(writer);
          stream.resume();
          fail(error);
        }
      });
      stream.on('error', fail);
      writer.on('error', fail);
      writer.on('finish', () => {
        if (settled) return;
        try {
          preparedByField.set(fieldName, inspection.finish(temporaryPath));
          settled = true;
          resolve();
        } catch (error) {
          fail(error);
        }
      });
      stream.pipe(writer);
    });
    fileTasks.push(task.catch((error) => {
      if (!parserError) parserError = error;
    }));
  });

  parser.on('filesLimit', () => {
    parserError = new UploadHttpError('每次最多上傳 2 個檔案。', 400);
  });
  parser.on('partsLimit', () => {
    parserError = new UploadHttpError('上傳欄位數量超過限制。', 400);
  });

  try {
    const source = Readable.fromWeb(request.body as never);
    source.on('data', (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_MULTIPART_BODY_BYTES) {
        source.destroy(new UploadHttpError('檔案上傳請求總量不得超過 220 MiB。', 413));
      }
    });
    await new Promise<void>((resolve, reject) => {
      source.on('error', reject);
      parser.on('error', reject);
      parser.on('close', resolve);
      source.pipe(parser);
    });
    await Promise.all(fileTasks);
    if (parserError) throw parserError;
    if (!metadataText) throw new UploadHttpError('缺少上傳中繼資料。', 400);

    let metadata: Record<string, unknown>;
    try {
      const parsedMetadata = JSON.parse(metadataText) as unknown;
      if (!parsedMetadata || typeof parsedMetadata !== 'object' || Array.isArray(parsedMetadata)) {
        throw new Error('metadata 必須是 JSON 物件。');
      }
      metadata = parsedMetadata as Record<string, unknown>;
    } catch {
      throw new UploadHttpError('上傳中繼資料不是合法的 JSON。', 400);
    }

    return {
      metadata,
      file: preparedByField.get('file'),
      sourceFile: preparedByField.get('source_file'),
      temporaryDirectory
    };
  } catch (error) {
    await cleanupPreparedUploads([...preparedByField.values()]);
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
};
