import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';

export interface UploadPayload {
  name: string;
  mime: string;
  base64: string;
}

export interface StoredFile {
  name: string;
  relativePath: string;
  absolutePath: string;
  ext: string;
  mime: string;
  size: number;
  sha256: string;
}

const officeMimeByExt: Record<string, string> = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

const mimeByExt: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
  ...officeMimeByExt
};

const allowedExts = new Set(Object.keys(mimeByExt));
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const bufferStartsWith = (bytes: Buffer, signature: number[]) =>
  bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);

const hasAsciiMarker = (bytes: Buffer, marker: string) => bytes.includes(Buffer.from(marker, 'ascii'));

const hasUtf16LeMarker = (bytes: Buffer, marker: string) => bytes.includes(Buffer.from(marker, 'utf16le'));

const matchesFileSignature = (ext: string, bytes: Buffer) => {
  if (ext === 'pdf') return bufferStartsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (ext === 'jpg' || ext === 'jpeg') return bufferStartsWith(bytes, [0xff, 0xd8, 0xff]);
  if (ext === 'png') return bufferStartsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (ext === 'gif') return hasAsciiMarker(bytes.subarray(0, 6), 'GIF87a') || hasAsciiMarker(bytes.subarray(0, 6), 'GIF89a');
  if (ext === 'tif' || ext === 'tiff') {
    return bufferStartsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || bufferStartsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a]);
  }
  if (ext === 'webp') {
    return bufferStartsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx') {
    if (!bufferStartsWith(bytes, [0x50, 0x4b]) || !hasAsciiMarker(bytes, '[Content_Types].xml')) return false;
    const folder = ext === 'docx' ? 'word/' : ext === 'xlsx' ? 'xl/' : 'ppt/';
    return hasAsciiMarker(bytes, folder);
  }

  if (ext === 'doc' || ext === 'xls' || ext === 'ppt') {
    if (!bufferStartsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return false;
    if (ext === 'doc') return hasUtf16LeMarker(bytes, 'WordDocument');
    if (ext === 'xls') return hasUtf16LeMarker(bytes, 'Workbook') || hasUtf16LeMarker(bytes, 'Book');
    return hasUtf16LeMarker(bytes, 'PowerPoint Document');
  }

  return false;
};

const decodeValidatedBase64 = (base64: unknown) => {
  if (typeof base64 !== 'string' || base64.length === 0) {
    throw new Error('不允許上傳空檔案。');
  }

  const maxEncodedLength = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4;
  if (base64.length > maxEncodedLength) {
    throw new Error('正式發佈檔案大小不得超過 100 MB。');
  }

  if (!BASE64_PATTERN.test(base64)) {
    throw new Error('檔案內容不是合法的 Base64 格式。');
  }

  const paddingLength = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const estimatedSize = (base64.length / 4) * 3 - paddingLength;
  if (estimatedSize > MAX_UPLOAD_BYTES) {
    throw new Error('正式發佈檔案大小不得超過 100 MB。');
  }

  const bytes = Buffer.from(base64, 'base64');
  if (bytes.byteLength === 0) {
    throw new Error('不允許上傳空檔案。');
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error('正式發佈檔案大小不得超過 100 MB。');
  }

  return bytes;
};

const resolveConfiguredRoot = (value: string, fallback = '') => {
  const configuredPath = value.trim() || fallback;

  if (!configuredPath) {
    return '';
  }

  return path.isAbsolute(configuredPath)
    ? path.normalize(configuredPath)
    : path.resolve(
        /*turbopackIgnore: true*/ process.cwd(),
        configuredPath
      );
};

export const getStorageRoot = () => resolveConfiguredRoot(
  process.env.DMS_STORAGE_ROOT || '',
  './storage'
);

const getLegacyStorageRoot = () =>
  resolveConfiguredRoot(process.env.DMS_LEGACY_STORAGE_ROOT || '');

export const getFileExt = (fileName: string) => {
  const ext = path.extname(fileName || '').replace(/^\./, '').toLowerCase();
  return ext;
};

export const isPdfExt = (ext: string) => ext.toLowerCase() === 'pdf';

export const validateUploadFile = (file: UploadPayload) => {
  if (!file || typeof file.name !== 'string' || typeof file.mime !== 'string') {
    throw new Error('上傳檔案資料不完整。');
  }

  const ext = getFileExt(file.name);

  if (!allowedExts.has(ext)) {
    throw new Error(`不允許上傳此檔案格式：${ext || '無副檔名'}。`);
  }

  const actualMime = file.mime.split(';', 1)[0].trim().toLowerCase();
  const expectedMime = mimeByExt[ext].toLowerCase();
  if (actualMime !== expectedMime) {
    throw new Error(`檔案 MIME Type 與副檔名不一致：.${ext} 應為 ${expectedMime}。`);
  }

  const bytes = decodeValidatedBase64(file.base64);
  if (!matchesFileSignature(ext, bytes)) {
    throw new Error(`檔案特徵碼與副檔名或 MIME Type 不一致：.${ext}。`);
  }

  return {
    ext,
    mime: expectedMime,
    bytes
  };
};

export const saveUploadedFile = async (file: UploadPayload): Promise<StoredFile> => {
  const { ext, mime, bytes } = validateUploadFile(file);
  const yyyyMm = new Date().toISOString().slice(0, 7).replace('-', '');
  const fileName = `${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${randomUUID()}.${ext}`;
  const relativePath = path.join('storage', yyyyMm, fileName);
  const absolutePath = path.join(
    /*turbopackIgnore: true*/ getStorageRoot(),
    yyyyMm,
    fileName
  );

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);

  return {
    name: file.name,
    relativePath,
    absolutePath,
    ext,
    mime,
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
};

export const resolveStoredPath = async (storedPath: string) => {
  const candidates = path.isAbsolute(storedPath)
    ? [storedPath]
    : [
        path.join(
          /*turbopackIgnore: true*/ getStorageRoot(),
          storedPath.replace(/^storage[\\/]/i, '')
        ),
        getLegacyStorageRoot()
          ? path.join(
              /*turbopackIgnore: true*/ getLegacyStorageRoot(),
              storedPath
            )
          : ''
      ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await stat(/*turbopackIgnore: true*/ candidate);
      return candidate;
    } catch {
      // 繼續嘗試下一個候選路徑。
    }
  }

  throw new Error('找不到實體檔案。');
};

export const createFileStream = async (storedPath: string) => {
  const absolutePath = await resolveStoredPath(storedPath);
  const info = await stat(/*turbopackIgnore: true*/ absolutePath);

  return {
    stream: createReadStream(/*turbopackIgnore: true*/ absolutePath),
    size: info.size
  };
};

export const buildContentDisposition = (type: 'inline' | 'attachment', fileName: string) => {
  const safeAsciiName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  const encodedName = encodeURIComponent(fileName);

  return `${type}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`;
};
