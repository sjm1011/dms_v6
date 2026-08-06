import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createUploadInspection,
  isInsideStorageRoot,
  resolveAllowedStoredFile,
  StoredFileJournal
} from './fileStorage';

const temporaryRoots: string[] = [];
const originalStorageRoot = process.env.DMS_STORAGE_ROOT;
const originalLegacyRoot = process.env.DMS_LEGACY_STORAGE_ROOT;

afterEach(async () => {
  process.env.DMS_STORAGE_ROOT = originalStorageRoot;
  process.env.DMS_LEGACY_STORAGE_ROOT = originalLegacyRoot;
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const createTemporaryRoot = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dms-v6-test-'));
  temporaryRoots.push(root);
  return root;
};

describe('儲存路徑邊界', () => {
  it('拒絕相似前綴與上層目錄', () => {
    const root = path.resolve('C:\\DMS\\storage');
    expect(isInsideStorageRoot(root, path.join(root, '202608', 'file.pdf'))).toBe(true);
    expect(isInsideStorageRoot(root, `${root}-other${path.sep}file.pdf`)).toBe(false);
    expect(isInsideStorageRoot(root, path.join(root, '..', 'secret.txt'))).toBe(false);
  });

  it('只解析目前或 Legacy Root 內的一般檔案', async () => {
    const root = await createTemporaryRoot();
    const legacy = await createTemporaryRoot();
    const outside = await createTemporaryRoot();
    process.env.DMS_STORAGE_ROOT = root;
    process.env.DMS_LEGACY_STORAGE_ROOT = legacy;
    await mkdir(path.join(root, '202608'), { recursive: true });
    await writeFile(path.join(root, '202608', 'current.pdf'), '%PDF-test');
    await writeFile(path.join(legacy, 'legacy.pdf'), '%PDF-test');
    await writeFile(path.join(outside, 'secret.txt'), 'secret');

    await expect(resolveAllowedStoredFile(path.join('storage', '202608', 'current.pdf'))).resolves.toMatchObject({ root });
    await expect(resolveAllowedStoredFile(path.join(legacy, 'legacy.pdf'))).resolves.toMatchObject({ root: legacy });
    await expect(resolveAllowedStoredFile(path.join(outside, 'secret.txt'))).rejects.toThrow('找不到實體檔案。');
  });

  it('拒絕透過 Junction 或符號連結離開儲存根目錄', async ({ skip }) => {
    const root = await createTemporaryRoot();
    const outside = await createTemporaryRoot();
    process.env.DMS_STORAGE_ROOT = root;
    process.env.DMS_LEGACY_STORAGE_ROOT = '';
    await writeFile(path.join(outside, 'secret.txt'), 'secret');
    const linkedDirectory = path.join(root, 'linked');
    try {
      await symlink(outside, linkedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') skip();
      throw error;
    }

    await expect(resolveAllowedStoredFile(path.join(linkedDirectory, 'secret.txt'))).rejects.toThrow(
      '找不到實體檔案。'
    );
  });
});

describe('串流檔案檢查與補償清理', () => {
  it('跨 Chunk 驗證 PDF 並計算雜湊與大小', () => {
    const inspection = createUploadInspection('test.pdf', 'application/pdf');
    inspection.update(Buffer.from('%PD'));
    inspection.update(Buffer.from('F-1.7\ncontent'));
    const result = inspection.finish('temporary.upload');
    expect(result.size).toBe(16);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('拒絕空檔案與錯誤特徵碼', () => {
    expect(() => createUploadInspection('empty.pdf', 'application/pdf').finish('empty.upload')).toThrow(
      '不允許上傳空檔案。'
    );
    const invalid = createUploadInspection('fake.pdf', 'application/pdf');
    invalid.update(Buffer.from('not-a-pdf'));
    expect(() => invalid.finish('fake.upload')).toThrow('檔案特徵碼與副檔名或 MIME Type 不一致：.pdf。');
  });

  it('交易失敗時刪除 Journal 內的新檔案', async () => {
    const root = await createTemporaryRoot();
    const file = path.join(root, 'created.pdf');
    await writeFile(file, '%PDF-test');
    const journal = new StoredFileJournal();
    journal.record(file);
    await journal.rollback();
    await expect(resolveAllowedStoredFile(file)).rejects.toThrow('找不到實體檔案。');
  });
});
