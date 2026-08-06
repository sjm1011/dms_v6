const actionLabels: Record<string, string> = {
  AUTH_LOGIN_SUCCESS: '登入成功',
  AUTH_LOGIN_FAILED: '登入失敗',
  DOCUMENT_PREVIEWED: '調閱文件',
  DOCUMENT_PREVIEW_DENIED: '調閱文件遭拒',
  DOCUMENT_DOWNLOADED: '下載文件',
  DOCUMENT_DOWNLOAD_DENIED: '文件下載遭拒',
  FOLDER_CREATED: '建立資料夾',
  FOLDER_UPDATED: '修改資料夾',
  FOLDER_MANAGER_UPDATED: '修改資料夾管理員',
  FOLDER_CO_MANAGER_UPDATED: '修改協同管理員',
  FOLDER_DELETED: '刪除資料夾',
  FOLDER_ARCHIVED: '封存資料夾',
  FOLDER_ACL_UPDATED: '修改資料夾權限',
  FOLDER_RESTORED: '還原資料夾',
  FOLDER_PURGED: '永久刪除資料夾',
  DOCUMENT_CREATED: '建立文件',
  DOCUMENT_VERSION_CREATED: '上傳新版文件',
  DOCUMENT_UPDATED: '修改文件描述',
  DOCUMENT_VERSION_CANCELLED: '撤回新版文件',
  DOCUMENT_VERSION_DELETED: '刪除預約版本',
  DOCUMENT_MOVED: '移動文件',
  DOCUMENT_OBSOLETED: '廢止文件',
  DOCUMENT_DELETED: '刪除文件',
  SYSTEM_ADMIN_ASSIGNED: '指定系統管理員',
  SYSTEM_ADMIN_REVOKED: '撤銷系統管理員',
  ANNOUNCEMENT_CREATED: '建立公告',
  ANNOUNCEMENT_UPDATED: '修改公告',
  ANNOUNCEMENT_PUBLISHED: '發佈公告',
  ANNOUNCEMENT_ARCHIVED: '封存公告',
  AUDIT_LOG_EXPORTED: '匯出稽核紀錄'
};

const resourceLabels: Record<string, string> = {
  AUTH: '登入驗證',
  FOLDER: '資料夾',
  ACL: '資料夾權限',
  DOCUMENT: '文件',
  VERSION: '文件版本',
  ADMIN: '系統管理員',
  ANNOUNCEMENT: '系統公告',
  AUDIT: '稽核紀錄'
};

const resultLabels: Record<string, string> = {
  SUCCESS: '成功',
  FAILED: '失敗',
  DENIED: '已拒絕'
};

export const getAuditActionLabel = (value: unknown) =>
  actionLabels[String(value || '').toUpperCase()] || '其他系統操作';

export const getAuditResourceLabel = (value: unknown) =>
  resourceLabels[String(value || '').toUpperCase()] || '系統資源';

export const getAuditResultLabel = (value: unknown) =>
  resultLabels[String(value || '').toUpperCase()] || '未定義結果';

export const getAuditRoleLabel = (value: unknown) => {
  const role = String(value || '').toUpperCase();
  if (role === 'ADMIN') return '系統管理員';
  if (role === 'USER') return '一般使用者';
  return '無登入角色';
};

export const formatAuditActor = (name: unknown, employeeId: unknown) =>
  `${String(name || '系統')} ${String(employeeId || '無員工編號')}`;
