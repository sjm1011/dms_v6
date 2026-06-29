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
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  mhtml: 'message/rfc822',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  ...officeMimeByExt
};

const allowedExts = new Set(Object.keys(mimeByExt));

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

export const isHtmlExt = (ext: string) => ['html', 'htm', 'mhtml'].includes(ext.toLowerCase());

export const validateUploadFile = (file: UploadPayload) => {
  const ext = getFileExt(file.name);

  if (!allowedExts.has(ext)) {
    throw new Error(`不允許上傳此檔案格式：${ext || '無副檔名'}。`);
  }

  return {
    ext,
    mime: mimeByExt[ext] || file.mime || 'application/octet-stream'
  };
};

export const saveUploadedFile = async (file: UploadPayload): Promise<StoredFile> => {
  const { ext, mime } = validateUploadFile(file);
  const bytes = Buffer.from(file.base64, 'base64');
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
