'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { EmployeeAPI } from '../api/employee';
import { type AuditQuery, SystemAPI } from '../api/system';
import { formatAuditActor, getAuditActionLabel, getAuditResourceLabel, getAuditResultLabel, getAuditRoleLabel } from '../lib/auditLabels';
import type { AuditLogItem, PermissionOverviewItem, PurgeJobItem, RecycleBatchItem, SystemAdminItem, SystemPage, SystemStatusData } from '../types';
import { CheckCircleIcon, CloudDownloadIcon, DeleteIcon, ErrorOutlineIcon, PersonIcon, SearchIcon } from './Icons';
import { Modal } from './Modal';

interface SystemManagementProps {
  page: SystemPage;
  currentUserId: string;
  isSystemAdmin: boolean;
  onOpenFolder: (folderId: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const formatDateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('zh-TW') : '—';
const formatAuditDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};
const localDate = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
const recentDateRange = (months: number) => {
  const today = new Date();
  const dateTo = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateFrom = new Date(dateTo);
  const targetMonth = dateFrom.getMonth() - months;
  const targetYear = dateFrom.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  dateFrom.setFullYear(targetYear, normalizedMonth, Math.min(dateFrom.getDate(), lastDay));
  return { date_from: localDate(dateFrom), date_to: localDate(dateTo) };
};

const PageShell: React.FC<{ title: string; description: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, description, actions, children }) => (
  <div className="system-page">
    <header className="system-page-header">
      <div><p className="system-root-label">系統管理</p><h1>{title}</h1><p>{description}</p></div>
      {actions && <div className="system-page-actions">{actions}</div>}
    </header>
    <div className="system-page-body">{children}</div>
  </div>
);

const Loading = () => <div className="system-loading" role="status">資料載入中...</div>;
const Empty = ({ text }: { text: string }) => <div className="system-empty">{text}</div>;

const formatAuditTarget = (row: AuditLogItem) => {
  const targetType = getAuditResourceLabel(row.target_type || row.resource_type);
  const targetName = row.target_name || row.document_name || row.folder_name || row.resource_id || '系統資源';
  const version = row.target_version ? `，第 ${row.target_version} 版` : '';
  return `${targetType}：${targetName}${version}`;
};

const withoutAuditContext = (metadata: Record<string, unknown>) => {
  const result = { ...metadata };
  delete result.audit_context;
  return result;
};

const AuditPage: React.FC<{
  isSystemAdmin: boolean;
  showToast: SystemManagementProps['showToast'];
}> = ({ isSystemAdmin, showToast }) => {
  const [filters, setFilters] = useState<AuditQuery>({ ...recentDateRange(1), page: 1, page_size: 50 });
  const [draft, setDraft] = useState(filters);
  const [dateRangePreset, setDateRangePreset] = useState('1');
  const [rows, setRows] = useState<AuditLogItem[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AuditLogItem | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await SystemAPI.getAuditLogs(filters);
      setRows(response.data.rows || []);
      setTotal(response.data.total || 0);
      setActions(response.data.actions || []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally { setLoading(false); }
  }, [filters, showToast]);
  useEffect(() => { void load(); }, [load]);

  const pageSize = Number(filters.page_size || 50);
  const page = Number(filters.page || 1);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await SystemAPI.exportAuditLogs(filters);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${isSystemAdmin ? '系統稽核紀錄' : '管理範圍文件稽核紀錄'}_${localDate(new Date())}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast('稽核紀錄已匯出。', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
    finally { setExporting(false); }
  };

  const updateDateRange = (value: string) => {
    setDateRangePreset(value);
    if (!value) return;
    setDraft(current => ({ ...current, ...recentDateRange(Number(value)) }));
  };

  const pageTitle = isSystemAdmin ? '系統稽核紀錄' : '管理範圍文件稽核紀錄';
  const pageDescription = isSystemAdmin
    ? '以事件時間、操作者、稽核事件、資源位置、操作標的及執行結果呈現現行 dms_log。'
    : '顯示目前管理資料夾及其所有子資料夾的歷史文件操作紀錄。';

  return <PageShell title={pageTitle} description={pageDescription} actions={<button className="btn btn-secondary" disabled={exporting} onClick={exportCsv}><CloudDownloadIcon size={18} />{exporting ? '匯出中...' : '匯出 CSV'}</button>}>
    <form className="system-filter-grid" onSubmit={event => { event.preventDefault(); setFilters({ ...draft, page: 1 }); }}>
      <label>日期範圍<select value={dateRangePreset} onChange={e => updateDateRange(e.target.value)}><option value="">自訂日期</option><option value="1">最近一個月</option><option value="3">最近三個月</option><option value="6">最近六個月</option><option value="9">最近九個月</option><option value="12">最近一年</option></select></label>
      <label>開始日期<input type="date" value={draft.date_from || ''} onChange={e => { setDateRangePreset(''); setDraft({ ...draft, date_from: e.target.value }); }} /></label>
      <label>結束日期<input type="date" value={draft.date_to || ''} onChange={e => { setDateRangePreset(''); setDraft({ ...draft, date_to: e.target.value }); }} /></label>
      <label>操作者<input value={draft.actor || ''} onChange={e => setDraft({ ...draft, actor: e.target.value })} placeholder="員編或姓名" /></label>
      <label>稽核事件<select value={draft.action || ''} onChange={e => setDraft({ ...draft, action: e.target.value })}><option value="">全部</option>{actions.map(action => <option key={action} value={action}>{getAuditActionLabel(action)}</option>)}</select></label>
      <label>執行結果<select value={draft.result || ''} onChange={e => setDraft({ ...draft, result: e.target.value })}><option value="">全部</option><option value="SUCCESS">成功</option><option value="FAILED">失敗</option><option value="DENIED">已拒絕</option></select></label>
      <label>關鍵字<input value={draft.keyword || ''} onChange={e => setDraft({ ...draft, keyword: e.target.value })} placeholder="位置、標的或原因" /></label>
      <button className="btn btn-primary" type="submit"><SearchIcon size={18} />查詢</button>
    </form>
    {loading ? <Loading /> : rows.length === 0 ? <Empty text="查無符合條件的稽核紀錄。" /> : <div className="system-table-wrap"><table className="system-table audit-table"><thead><tr><th>事件時間</th><th>操作者</th><th>稽核事件</th><th>資源位置</th><th>操作標的</th><th>執行結果</th><th></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{formatAuditDateTime(row.event_at)}</td><td>{formatAuditActor(row.actor_name, row.actor_uid)}</td><td>{getAuditActionLabel(row.action)}</td><td className="audit-location" data-tooltip={row.resource_location || '系統'}>{row.resource_location || '系統'}</td><td className="audit-target" data-tooltip={formatAuditTarget(row)}>{formatAuditTarget(row)}</td><td><span className={`status-chip ${row.result.toLowerCase()}`}>{getAuditResultLabel(row.result)}</span></td><td><button className="btn btn-secondary btn-small" onClick={() => setDetail(row)}>明細</button></td></tr>)}</tbody></table></div>}
    <div className="system-pagination"><span>共 {total} 筆</span><select value={pageSize} onChange={e => setFilters({ ...filters, page: 1, page_size: Number(e.target.value) })}><option value={25}>25 筆</option><option value={50}>50 筆</option><option value={100}>100 筆</option></select><button className="btn btn-secondary btn-small" disabled={page <= 1} onClick={() => setFilters({ ...filters, page: page - 1 })}>上一頁</button><span>{page} / {pages}</span><button className="btn btn-secondary btn-small" disabled={page >= pages} onClick={() => setFilters({ ...filters, page: page + 1 })}>下一頁</button></div>
    <Modal isOpen={Boolean(detail)} onClose={() => setDetail(null)} title="稽核紀錄明細" contentClassName="modal-content-history" footer={<button className="btn btn-secondary" onClick={() => setDetail(null)}>關閉</button>}>
      {detail && <div className="audit-detail"><dl><dt>事件時間</dt><dd>{formatAuditDateTime(detail.event_at)}</dd><dt>操作者</dt><dd>{formatAuditActor(detail.actor_name, detail.actor_uid)}</dd><dt>操作者角色</dt><dd>{getAuditRoleLabel(detail.actor_role)}</dd><dt>稽核事件</dt><dd>{getAuditActionLabel(detail.action)}</dd><dt>資源位置</dt><dd>{detail.resource_location || '系統'}</dd><dt>操作標的</dt><dd>{formatAuditTarget(detail)}</dd><dt>執行結果</dt><dd>{getAuditResultLabel(detail.result)}</dd><dt>結果原因</dt><dd>{detail.reason || '—'}</dd><dt>事件來源 IP</dt><dd>{detail.ip_address || '—'}</dd><dt>用戶端識別資訊</dt><dd>{detail.user_agent || '—'}</dd><dt>請求追蹤識別碼</dt><dd>{detail.request_id || '—'}</dd><dt>關聯識別碼</dt><dd>資源：{detail.resource_id || '—'}、資料夾：{detail.folder_id || '—'}、文件：{detail.document_id || '—'}、版本：{detail.version_id || '—'}</dd></dl><h4>異動前資料</h4><pre>{JSON.stringify(detail.before_data || {}, null, 2)}</pre><h4>異動後資料</h4><pre>{JSON.stringify(detail.after_data || {}, null, 2)}</pre><h4>其他技術資料</h4><pre>{JSON.stringify(withoutAuditContext(detail.metadata || {}), null, 2)}</pre></div>}
    </Modal>
  </PageShell>;
};

const SettingsPage: React.FC<{ currentUserId: string; showToast: SystemManagementProps['showToast'] }> = ({ currentUserId, showToast }) => {
  const [admins, setAdmins] = useState<SystemAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [verified, setVerified] = useState<{ uid: string; name: string } | null>(null);
  const [validating, setValidating] = useState(false);
  const [revoke, setRevoke] = useState<SystemAdminItem | null>(null);
  const load = useCallback(async () => { setLoading(true); try { setAdmins((await SystemAPI.getAdmins()).data || []); } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); } finally { setLoading(false); } }, [showToast]);
  useEffect(() => { void load(); }, [load]);
  const validate = async () => {
    const normalized = employeeId.trim().toUpperCase();
    setEmployeeId(normalized); setVerified(null);
    if (!normalized) return;
    setValidating(true);
    try {
      const result = await EmployeeAPI.getEmployeeByUid(normalized, 'system_admin');
      const employee = result.data?.[0];
      if (!employee) throw new Error('查無此在職員工。');
      setVerified(employee);
    } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
    finally { setValidating(false); }
  };
  const assign = async () => {
    if (!verified || verified.uid !== employeeId) return;
    try { await SystemAPI.assignAdmin(employeeId); showToast('系統管理員已指定，對象重新登入後生效。', 'success'); setAddOpen(false); setEmployeeId(''); setVerified(null); await load(); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  const confirmRevoke = async () => {
    if (!revoke) return;
    try { await SystemAPI.revokeAdmin(revoke.emp_id); showToast('系統管理員權限已撤銷，對象重新登入後生效。', 'success'); setRevoke(null); await load(); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };
  return <PageShell title="系統設定" description="目前提供系統管理員設定；其他系統設定將於後續功能加入。" actions={<button className="btn btn-primary" onClick={() => setAddOpen(true)}><PersonIcon size={18} />指定系統管理員</button>}>
    <section className="system-section"><div className="system-section-title"><h2>系統管理員</h2><p>角色異動必須重新登入才會生效。</p></div>
      {loading ? <Loading /> : <div className="system-table-wrap"><table className="system-table"><thead><tr><th>員工編號</th><th>姓名</th><th>部門</th><th>指定人</th><th>指定時間</th><th></th></tr></thead><tbody>{admins.map(admin => <tr key={admin.emp_id}><td>{admin.emp_id}</td><td>{admin.emp_name}</td><td>{admin.dept_name || '—'}</td><td>{admin.assigned_by}</td><td>{formatDateTime(admin.assigned_at)}</td><td><button className="btn btn-danger btn-small" disabled={admin.emp_id.toUpperCase() === currentUserId.toUpperCase()} onClick={() => setRevoke(admin)}>撤銷</button></td></tr>)}</tbody></table></div>}
    </section>
    <Modal isOpen={addOpen} onClose={() => { setAddOpen(false); setEmployeeId(''); setVerified(null); }} title="指定系統管理員" footer={<><button className="btn btn-secondary" onClick={() => setAddOpen(false)}>取消</button><button className="btn btn-primary" disabled={!verified || verified.uid !== employeeId} onClick={assign}>指定</button></>}>
      <label>員工編號<input data-enter-action="blur-or-submit" value={employeeId} onChange={e => { setEmployeeId(e.target.value.toUpperCase()); setVerified(null); }} onBlur={() => void validate()} placeholder="請輸入員工編號" /></label>
      <div className={`lookup-result ${verified ? 'success' : ''}`}>{validating ? '驗證中...' : verified ? `姓名：${verified.name}` : '輸入後按 Enter 或移出欄位進行驗證。'}</div>
    </Modal>
    <Modal isOpen={Boolean(revoke)} onClose={() => setRevoke(null)} title="撤銷系統管理員" footer={<><button className="btn btn-secondary" onClick={() => setRevoke(null)}>取消</button><button className="btn btn-danger" onClick={confirmRevoke}>確認撤銷</button></>}>
      <p>確定撤銷「{revoke?.emp_name}（{revoke?.emp_id}）」的系統管理員權限？對象重新登入後才會生效。</p>
    </Modal>
  </PageShell>;
};

const PermissionsPage: React.FC<{ onOpenFolder: (id: string) => void; showToast: SystemManagementProps['showToast'] }> = ({ onOpenFolder, showToast }) => {
  const [items, setItems] = useState<PermissionOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [mode, setMode] = useState('all');
  useEffect(() => { void (async () => { try { setItems((await SystemAPI.getPermissions()).data || []); } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); } finally { setLoading(false); } })(); }, [showToast]);
  const filtered = useMemo(() => items.filter(item => (!keyword || item.folder_name.includes(keyword)) && (mode === 'all' || (mode === 'missing' ? !item.primary_managers : String(item.access_type) === mode))), [items, keyword, mode]);
  return <PageShell title="權限總覽" description="集中檢視第一層資料夾權限；權限修改仍由文件庫中的資料夾畫面處理。">
    <div className="system-inline-filters"><input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜尋資料夾名稱" /><select value={mode} onChange={e => setMode(e.target.value)}><option value="all">全部</option><option value="missing">缺少主要管理員</option><option value="1">公開</option><option value="2">限閱</option><option value="3">僅限管理者</option></select></div>
    {loading ? <Loading /> : filtered.length === 0 ? <Empty text="查無符合條件的資料夾。" /> : <div className="system-table-wrap"><table className="system-table"><thead><tr><th>資料夾</th><th>主要管理員</th><th>協同管理員</th><th>存取模式</th><th>授權摘要</th><th>項目</th><th></th></tr></thead><tbody>{filtered.map(item => <tr key={item.folder_id}><td>{item.folder_name}</td><td className={!item.primary_managers ? 'danger-text' : ''}>{item.primary_managers || '未指派'}</td><td>{item.co_managers || '—'}</td><td>{item.access_type === 2 ? '限閱' : item.access_type === 3 ? '僅限管理者' : '公開'}</td><td>{item.access_type === 2 ? (item.acl_summary || '—') : '—'}</td><td>{item.child_folder_count} 個子資料夾／{item.document_count} 份文件</td><td><button className="btn btn-secondary btn-small" onClick={() => onOpenFolder(item.folder_id)}>前往資料夾</button></td></tr>)}</tbody></table></div>}
  </PageShell>;
};

const StatusPage: React.FC<{ showToast: SystemManagementProps['showToast'] }> = ({ showToast }) => {
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { setData((await SystemAPI.getStatus()).data); } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); } finally { setLoading(false); } }, [showToast]);
  useEffect(() => { void load(); }, [load]);
  const configRows = data ? [['Session 密鑰', data.configuration.session_secret_secure], ['儲存根目錄', data.configuration.storage_root_configured], ['安全 Cookie', data.configuration.secure_cookie], ['資料庫設定', data.configuration.database_configured]] as const : [];
  return <PageShell title="系統狀態" description="顯示唯讀執行狀態、設定安全檢查與資料統計，不揭露密碼或密鑰。" actions={<button className="btn btn-secondary" disabled={loading} onClick={() => void load()}>重新整理</button>}>
    {loading || !data ? <Loading /> : <><div className="status-card-grid"><section className="status-card"><h3>應用程式</h3><dl><dt>版本日期</dt><dd>{data.application.version_date}</dd><dt>環境</dt><dd>{data.application.environment}</dd><dt>伺服器時間</dt><dd>{formatDateTime(data.application.server_time)}</dd><dt>執行時間</dt><dd>{Math.floor(data.application.uptime_seconds / 60)} 分鐘</dd></dl></section><section className="status-card"><h3>PostgreSQL</h3><dl><dt>狀態</dt><dd className="success-text">已連線</dd><dt>版本</dt><dd>{data.database.version}</dd><dt>查詢延遲</dt><dd>{data.database.latency_ms} ms</dd><dt>連線池</dt><dd>{data.database.pool_total} 總數／{data.database.pool_idle} 閒置／{data.database.pool_waiting} 等待</dd></dl></section><section className="status-card"><h3>儲存空間</h3><dl><dt>根目錄</dt><dd className="path-value">{data.storage.root}</dd><dt>讀寫</dt><dd className={data.storage.readable && data.storage.writable ? 'success-text' : 'danger-text'}>{data.storage.readable && data.storage.writable ? '正常' : '異常'}</dd><dt>容量</dt><dd>{formatBytes(data.storage.total_bytes - data.storage.free_bytes)}／{formatBytes(data.storage.total_bytes)}</dd><dt>剩餘</dt><dd>{formatBytes(data.storage.free_bytes)}</dd></dl></section><section className="status-card"><h3>設定檢查</h3><ul className="config-check-list">{configRows.map(([label, value]) => <li key={label}>{value ? <CheckCircleIcon size={18} /> : <ErrorOutlineIcon size={18} />}<span>{label}</span><strong>{value ? '正常' : '需檢查'}</strong></li>)}</ul></section></div><section className="system-section"><div className="system-section-title"><h2>資料統計</h2></div><div className="statistics-grid">{Object.entries(data.statistics).map(([key, value]) => <div key={key}><span>{({ active_folders:'有效資料夾', archived_folders:'封存資料夾', deleted_folders:'作廢資料夾', active_documents:'有效文件', obsolete_documents:'廢止文件', versions:'文件版本', admins:'有效管理員', audit_logs:'稽核紀錄', registered_file_bytes:'登錄檔案容量', pending_purge_jobs:'待清理工作', failed_purge_jobs:'失敗清理工作' } as Record<string,string>)[key] || key}</span><strong>{key.endsWith('_bytes') ? formatBytes(value) : value.toLocaleString()}</strong></div>)}</div></section></>}
  </PageShell>;
};

const RecyclePage: React.FC<{ showToast: SystemManagementProps['showToast']; onChanged: () => void }> = ({ showToast, onChanged }) => {
  const [batches, setBatches] = useState<RecycleBatchItem[]>([]);
  const [jobs, setJobs] = useState<PurgeJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restore, setRestore] = useState<RecycleBatchItem | null>(null);
  const [purge, setPurge] = useState<RecycleBatchItem | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const load = useCallback(async () => { setLoading(true); try { const data = (await SystemAPI.getRecycle()).data; setBatches(data.batches || []); setJobs(data.jobs || []); } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); } finally { setLoading(false); } }, [showToast]);
  useEffect(() => { void load(); }, [load]);
  const restoreBatch = async () => { if (!restore) return; try { await SystemAPI.recycleAction({ action: 'restore', folder_id: Number(restore.folder_id) }); showToast('封存資料夾已還原。', 'success'); setRestore(null); await load(); onChanged(); } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); } };
  const purgeBatch = async () => { if (!purge) return; try { await SystemAPI.recycleAction({ action: 'purge', folder_id: Number(purge.folder_id), confirmation_name: confirmation }); showToast('永久刪除工作已執行。', 'success'); setPurge(null); setConfirmation(''); await load(); onChanged(); } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); } };
  const retry = async (job: PurgeJobItem) => { try { await SystemAPI.recycleAction({ action: 'retry_cleanup', job_id: Number(job.job_id) }); showToast('隔離檔案清理完成。', 'success'); await load(); } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); } };
  return <PageShell title="資源回收區" description="封存項目可還原；封存滿 90 天後可作廢資料並永久刪除實體檔案。">
    {jobs.length > 0 && <section className="system-section warning-section"><div className="system-section-title"><h2>檔案清理工作</h2></div><div className="system-table-wrap"><table className="system-table"><thead><tr><th>工作</th><th>狀態</th><th>執行人</th><th>時間</th><th>錯誤</th><th></th></tr></thead><tbody>{jobs.map(job => <tr key={job.job_id}><td>#{job.job_id}</td><td>{job.status}</td><td>{job.requested_by}</td><td>{formatDateTime(job.requested_at)}</td><td>{job.error || '—'}</td><td>{job.status === 'CLEANUP_PENDING' && <button className="btn btn-secondary btn-small" onClick={() => void retry(job)}>重試清理</button>}</td></tr>)}</tbody></table></div></section>}
    {loading ? <Loading /> : batches.length === 0 ? <Empty text="目前沒有封存資料夾。" /> : <div className="system-table-wrap"><table className="system-table"><thead><tr><th>資料夾</th><th>封存資訊</th><th>內容</th><th>容量</th><th>可永久刪除</th><th></th></tr></thead><tbody>{batches.map(batch => <tr key={batch.folder_id}><td>{batch.folder_name}<small>{batch.folder_path}</small></td><td>{formatDateTime(batch.archived_at)}<small>{batch.archived_by || '—'}</small></td><td>{batch.child_folder_count} 個子資料夾／{batch.document_count} 份文件／{batch.file_count} 個檔案</td><td>{formatBytes(Number(batch.total_bytes))}</td><td>{batch.can_purge ? '是' : '未滿 90 天'}</td><td><div className="row-actions"><button className="btn btn-secondary btn-small" onClick={() => setRestore(batch)}>還原</button>{batch.can_purge && <button className="btn btn-danger btn-small" onClick={() => { setPurge(batch); setConfirmation(''); }}><DeleteIcon size={15} />永久刪除</button>}</div></td></tr>)}</tbody></table></div>}
    <Modal isOpen={Boolean(restore)} onClose={() => setRestore(null)} title="還原封存資料夾" footer={<><button className="btn btn-secondary" onClick={() => setRestore(null)}>取消</button><button className="btn btn-primary" onClick={restoreBatch}>確認還原</button></>}><p>將還原「{restore?.folder_name}」及同一次封存的子資料夾。只有因資料夾封存而自動廢止的文件會恢復。</p></Modal>
    <Modal isOpen={Boolean(purge)} onClose={() => { setPurge(null); setConfirmation(''); }} title="永久刪除封存資料夾" closeOnOverlayClick={false} footer={<><button className="btn btn-secondary" onClick={() => setPurge(null)}>取消</button><button className="btn btn-danger" disabled={confirmation !== purge?.folder_name} onClick={purgeBatch}>永久刪除</button></>}><p className="danger-text">此操作會刪除所有關聯實體檔案，完成後無法由介面還原。</p><label>請輸入完整資料夾名稱「{purge?.folder_name}」<input value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label></Modal>
  </PageShell>;
};

export const SystemManagement: React.FC<SystemManagementProps & { refreshFolders: () => Promise<void> }> = ({ page, currentUserId, isSystemAdmin, onOpenFolder, showToast, refreshFolders }) => {
  if (page === 'audit') return <AuditPage isSystemAdmin={isSystemAdmin} showToast={showToast} />;
  if (page === 'settings') return <SettingsPage currentUserId={currentUserId} showToast={showToast} />;
  if (page === 'permissions') return <PermissionsPage onOpenFolder={onOpenFolder} showToast={showToast} />;
  if (page === 'status') return <StatusPage showToast={showToast} />;
  return <RecyclePage showToast={showToast} onChanged={refreshFolders} />;
};
