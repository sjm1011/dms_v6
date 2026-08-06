import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';

export interface UploadPayload {
  name: string;
  mime: string;
  ext: string;
  size: number;
  sha256: string;
  temporaryPath: string;
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
const browserPreviewableImageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

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

const markerBuffersForExt = (ext: string) => {
  if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx') {
    return [
      Buffer.from('[Content_Types].xml', 'ascii'),
      Buffer.from(ext === 'docx' ? 'word/' : ext === 'xlsx' ? 'xl/' : 'ppt/', 'ascii')
    ];
  }
  if (ext === 'doc') return [Buffer.from('WordDocument', 'utf16le')];
  if (ext === 'xls') return [Buffer.from('Workbook', 'utf16le'), Buffer.from('Book', 'utf16le')];
  if (ext === 'ppt') return [Buffer.from('PowerPoint Document', 'utf16le')];
  return [];
};

const matchesStreamSignature = (ext: string, prefix: Buffer, markers: boolean[]) => {
  if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx') {
    return bufferStartsWith(prefix, [0x50, 0x4b]) && markers.every(Boolean);
  }
  if (ext === 'doc' || ext === 'xls' || ext === 'ppt') {
    const oleHeader = bufferStartsWith(prefix, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    return oleHeader && (ext === 'xls' ? markers.some(Boolean) : markers.every(Boolean));
  }
  return matchesFileSignature(ext, prefix);
};

export const createUploadInspection = (name: string, mime: string) => {
  const ext = getFileExt(name);
  if (!allowedExts.has(ext)) {
    throw new Error(`不允許上傳此檔案格式：${ext || '無副檔名'}。`);
  }
  const actualMime = mime.split(';', 1)[0].trim().toLowerCase();
  const expectedMime = mimeByExt[ext].toLowerCase();
  if (actualMime !== expectedMime) {
    throw new Error(`檔案 MIME Type 與副檔名不一致：.${ext} 應為 ${expectedMime}。`);
  }

  const hash = createHash('sha256');
  const markerBuffers = markerBuffersForExt(ext);
  const markerMatches = markerBuffers.map(() => false);
  const markerTailLength = Math.max(0, ...markerBuffers.map((marker) => marker.byteLength - 1));
  let markerTail = Buffer.alloc(0);
  let prefix = Buffer.alloc(0);
  let size = 0;
  let finished = false;

  return {
    update(chunk: Buffer) {
      if (finished) throw new Error('檔案串流已完成，不能再寫入資料。');
      size += chunk.byteLength;
      if (size > MAX_UPLOAD_BYTES) {
        throw new Error('正式發佈檔案大小不得超過 100 MB。');
      }
      hash.update(chunk);
      if (prefix.byteLength < 12) {
        prefix = Buffer.concat([prefix, chunk.subarray(0, 12 - prefix.byteLength)]);
      }
      if (markerBuffers.length > 0) {
        const searchable = Buffer.concat([markerTail, chunk]);
        markerBuffers.forEach((marker, index) => {
          if (!markerMatches[index] && searchable.includes(marker)) markerMatches[index] = true;
        });
        markerTail = searchable.subarray(Math.max(0, searchable.byteLength - markerTailLength));
      }
    },
    finish(temporaryPath: string): UploadPayload {
      if (finished) throw new Error('檔案串流已完成。');
      finished = true;
      if (size === 0) throw new Error('不允許上傳空檔案。');
      if (!matchesStreamSignature(ext, prefix, markerMatches)) {
        throw new Error(`檔案特徵碼與副檔名或 MIME Type 不一致：.${ext}。`);
      }
      return {
        name,
        mime: expectedMime,
        ext,
        size,
        sha256: hash.digest('hex'),
        temporaryPath
      };
    }
  };
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

export const getLegacyStorageRoot = () =>
  resolveConfiguredRoot(process.env.DMS_LEGACY_STORAGE_ROOT || '');

export const getIncomingRoot = () => path.join(getStorageRoot(), '.incoming');

export const getFileExt = (fileName: string) => {
  const ext = path.extname(fileName || '').replace(/^\./, '').toLowerCase();
  return ext;
};

export const isPdfExt = (ext: string) => ext.toLowerCase() === 'pdf';

export const isBrowserPreviewableImageExt = (ext: string) =>
  browserPreviewableImageExts.has(ext.replace(/^\./, '').toLowerCase());

export const isPreviewableExt = (ext: string) =>
  isPdfExt(ext.replace(/^\./, '')) || isBrowserPreviewableImageExt(ext);

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

  if (
    file.ext !== ext
    || !Number.isSafeInteger(file.size)
    || file.size <= 0
    || file.size > MAX_UPLOAD_BYTES
    || !/^[a-f0-9]{64}$/.test(file.sha256)
    || !file.temporaryPath
  ) {
    throw new Error('上傳檔案驗證狀態不正確。');
  }

  return {
    ext,
    mime: expectedMime,
    size: file.size,
    sha256: file.sha256,
    temporaryPath: file.temporaryPath
  };
};

export class StoredFileJournal {
  private readonly createdPaths = new Set<string>();

  record(absolutePath: string) {
    this.createdPaths.add(absolutePath);
  }

  commit() {
    this.createdPaths.clear();
  }

  async rollback() {
    const failures: unknown[] = [];
    for (const absolutePath of [...this.createdPaths].reverse()) {
      try {
        await rm(/*turbopackIgnore: true*/ absolutePath, { force: true });
      } catch (error) {
        failures.push(error);
      }
    }
    this.createdPaths.clear();
    if (failures.length > 0) {
      console.error(
        'Status：實體檔案補償清理未完全成功。\nRoot Cause：部分新建檔案無法刪除。\nSuggested Fix：檢查儲存目錄權限與伺服器記錄。',
        failures
      );
    }
  }
}

export const saveUploadedFile = async (
  file: UploadPayload,
  journal: StoredFileJournal
): Promise<StoredFile> => {
  const { ext, mime, size, sha256, temporaryPath } = validateUploadFile(file);
  const yyyyMm = new Date().toISOString().slice(0, 7).replace('-', '');
  const fileName = `${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${randomUUID()}.${ext}`;
  const relativePath = path.join('storage', yyyyMm, fileName);
  const absolutePath = path.join(
    /*turbopackIgnore: true*/ getStorageRoot(),
    yyyyMm,
    fileName
  );

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await rename(/*turbopackIgnore: true*/ temporaryPath, /*turbopackIgnore: true*/ absolutePath);
  journal.record(absolutePath);

  return {
    name: file.name,
    relativePath,
    absolutePath,
    ext,
    mime,
    size,
    sha256
  };
};

export const isInsideStorageRoot = (root: string, target: string) => {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
};

export const resolveAllowedStoredFile = async (storedPath: string) => {
  const configuredRoots = [getStorageRoot(), getLegacyStorageRoot()].filter(Boolean);
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
    for (const configuredRoot of configuredRoots) {
      try {
        const root = await realpath(/*turbopackIgnore: true*/ configuredRoot);
        const resolved = await realpath(/*turbopackIgnore: true*/ candidate);
        if (!isInsideStorageRoot(root, resolved)) continue;
        const info = await stat(/*turbopackIgnore: true*/ resolved);
        if (info.isFile()) return { resolved, root };
      } catch {
        // 無法解析、超出邊界或不是一般檔案時，繼續嘗試下一個候選位置。
      }
    }
  }

  throw new Error('找不到實體檔案。');
};

export const resolveStoredPath = async (storedPath: string) =>
  (await resolveAllowedStoredFile(storedPath)).resolved;

export const cleanupPreparedUploads = async (files: Array<UploadPayload | null | undefined>) => {
  await Promise.all(files.filter(Boolean).map(async (file) => {
    try {
      await rm(/*turbopackIgnore: true*/ file!.temporaryPath, { force: true });
    } catch {
      // 已移入正式位置或已由補償清理處理時，不需重複回報。
    }
  }));
};

export const cleanupStaleIncomingUploads = async (maxAgeMs = 24 * 60 * 60 * 1000) => {
  const incomingRoot = getIncomingRoot();
  let entries;
  try {
    entries = await readdir(/*turbopackIgnore: true*/ incomingRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  const cutoff = Date.now() - maxAgeMs;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const target = path.join(incomingRoot, entry.name);
    if (!isInsideStorageRoot(incomingRoot, target)) continue;
    const info = await stat(/*turbopackIgnore: true*/ target);
    if (info.mtimeMs < cutoff) {
      await rm(/*turbopackIgnore: true*/ target, { recursive: true, force: true });
    }
  }
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
