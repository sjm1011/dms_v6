export const register = async () => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const [{ assertProductionSessionConfiguration }, { cleanupStaleIncomingUploads }] = await Promise.all([
    import('./lib/session'),
    import('./lib/server/fileStorage')
  ]);

  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    assertProductionSessionConfiguration();
  }
  try {
    await cleanupStaleIncomingUploads();
  } catch (error) {
    console.error({
      Status: '暫存檔清理失敗',
      'Root Cause': error instanceof Error ? error.message : String(error),
      'Suggested Fix': '檢查 DMS_STORAGE_ROOT 與 Node.js 服務帳號的目錄權限。'
    });
  }
};
