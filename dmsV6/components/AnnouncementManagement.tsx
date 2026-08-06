'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { SystemAPI } from '../api/system';
import type {
  AnnouncementDisplayStatus,
  AnnouncementInput,
  AnnouncementManagementItem
} from '../types';
import { DeleteIcon, EditIcon, InfoIcon } from './Icons';
import { Modal } from './Modal';

interface AnnouncementManagementProps {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const emptyInput = (): AnnouncementInput => ({
  title: '',
  body: '',
  priority: 1,
  audience_all: true,
  audience_admin: false,
  audience_manager: false,
  published_at: null,
  expires_at: null
});

const formatDateTime = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString('zh-TW')
  : '—';

const toDateTimeInput = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const statusLabels: Record<AnnouncementDisplayStatus, string> = {
  DRAFT: '草稿',
  SCHEDULED: '預約發佈',
  PUBLISHED: '發佈中',
  EXPIRED: '已下架',
  ARCHIVED: '已封存'
};

const priorityLabel = (priority: number) => priority === 3 ? '緊急' : priority === 2 ? '重要' : '一般';

const audienceLabel = (item: AnnouncementManagementItem) => {
  if (item.audience_all) return '全體使用者';
  return [item.audience_admin ? '系統管理員' : '', item.audience_manager ? '資料夾管理員' : '']
    .filter(Boolean)
    .join('、');
};

const toInput = (item: AnnouncementManagementItem): AnnouncementInput => ({
  title: item.title,
  body: item.body,
  priority: item.priority,
  audience_all: item.audience_all,
  audience_admin: item.audience_admin,
  audience_manager: item.audience_manager,
  published_at: toDateTimeInput(item.published_at) || null,
  expires_at: toDateTimeInput(item.expires_at) || null
});

export const AnnouncementManagement: React.FC<AnnouncementManagementProps> = ({ showToast }) => {
  const [items, setItems] = useState<AnnouncementManagementItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorItem, setEditorItem] = useState<AnnouncementManagementItem | null | undefined>(undefined);
  const [input, setInput] = useState<AnnouncementInput>(emptyInput);
  const [archiveItem, setArchiveItem] = useState<AnnouncementManagementItem | null>(null);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await SystemAPI.getAnnouncements(status, page, pageSize);
      setItems(response.data.rows || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, showToast, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const editorOpen = editorItem !== undefined;
  const audienceValid = input.audience_all || input.audience_admin || input.audience_manager;
  const inputValid = input.title.trim().length > 0
    && input.title.trim().length <= 120
    && input.body.trim().length > 0
    && input.body.trim().length <= 2000
    && audienceValid;

  const openNew = () => {
    setInput(emptyInput());
    setEditorItem(null);
  };

  const openEdit = (item: AnnouncementManagementItem) => {
    setInput(toInput(item));
    setEditorItem(item);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorItem(undefined);
    setInput(emptyInput());
  };

  const save = async (publish: boolean) => {
    if (!inputValid) return;
    setSaving(true);
    try {
      if (!editorItem) {
        const created = await SystemAPI.createAnnouncementDraft(input);
        if (publish) {
          await SystemAPI.updateAnnouncement(
            created.data.announcement_id,
            created.data.revision,
            'publish',
            input
          );
        }
      } else {
        await SystemAPI.updateAnnouncement(
          editorItem.announcement_id,
          editorItem.revision,
          publish ? 'publish' : 'update',
          input
        );
      }
      showToast(publish ? '公告已發佈或完成排程。' : editorItem?.status === 1 ? '公告已更新，新版將重新列為未讀。' : '公告草稿已儲存。', 'success');
      setEditorItem(undefined);
      setInput(emptyInput());
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!archiveItem) return;
    setSaving(true);
    try {
      await SystemAPI.archiveAnnouncement(archiveItem.announcement_id, archiveItem.revision);
      showToast('公告已封存。', 'success');
      setArchiveItem(null);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const isPublished = editorItem?.status === 1;
  const footer = <>
      <button className="btn btn-secondary" disabled={saving} onClick={closeEditor}>取消</button>
      {isPublished ? (
        <button className="btn btn-primary" disabled={saving || !inputValid} onClick={() => void save(false)}>
          {saving ? '儲存中...' : '儲存變更'}
        </button>
      ) : <>
        <button className="btn btn-secondary" disabled={saving || !inputValid} onClick={() => void save(false)}>儲存草稿</button>
        <button className="btn btn-primary" disabled={saving || !inputValid} onClick={() => void save(true)}>
          {saving ? '發佈中...' : '發佈'}
        </button>
      </>}
    </>;

  return (
    <section className="system-section announcement-management-section">
      <div className="system-section-title announcement-management-title">
        <div><h2>公告管理</h2><p>發佈給全體使用者、系統管理員或資料夾管理員；已發佈公告修改後會增加版次。</p></div>
        <button className="btn btn-primary" onClick={openNew}>新增公告</button>
      </div>

      <div className="system-inline-filters announcement-filters">
        <label>公告狀態
          <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
            <option value="">全部</option>
            <option value="DRAFT">草稿</option>
            <option value="SCHEDULED">預約發佈</option>
            <option value="PUBLISHED">發佈中</option>
            <option value="EXPIRED">已下架</option>
            <option value="ARCHIVED">已封存</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="system-loading">資料載入中...</div>
      ) : items.length === 0 ? (
        <div className="system-empty"><InfoIcon size={28} /><p>目前沒有符合條件的公告。</p></div>
      ) : (
        <div className="system-table-wrap">
          <table className="system-table announcement-management-table">
            <thead><tr><th>公告</th><th>重要程度</th><th>狀態</th><th>對象</th><th>發佈／下架</th><th>版次</th><th></th></tr></thead>
            <tbody>{items.map(item => (
              <tr key={item.announcement_id}>
                <td><strong>{item.title}</strong><small>建立：{item.created_by}／{formatDateTime(item.created_at)}</small></td>
                <td><span className={`priority-badge priority-${item.priority}`}>{priorityLabel(item.priority)}</span></td>
                <td><span className={`announcement-status ${item.display_status.toLowerCase()}`}>{statusLabels[item.display_status]}</span></td>
                <td>{audienceLabel(item)}</td>
                <td>{formatDateTime(item.published_at)}<small>{item.expires_at ? `下架：${formatDateTime(item.expires_at)}` : '不自動下架'}</small></td>
                <td>第 {item.revision} 版</td>
                <td><div className="row-actions">
                  {item.status !== 2 && <button className="btn btn-secondary btn-small" onClick={() => openEdit(item)}><EditIcon size={15} />編輯</button>}
                  {item.status === 1 && <button className="btn btn-danger btn-small" onClick={() => setArchiveItem(item)}><DeleteIcon size={15} />封存</button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="system-pagination">
        <span>共 {total} 筆</span>
        <button className="btn btn-secondary btn-small" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一頁</button>
        <span>{page} / {pages}</span>
        <button className="btn btn-secondary btn-small" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>下一頁</button>
      </div>

      <Modal
        isOpen={editorOpen}
        onClose={closeEditor}
        closeOnOverlayClick={false}
        title={editorItem ? `編輯公告：${editorItem.title}` : '新增公告'}
        contentClassName="announcement-editor-modal"
        footer={footer}
      >
        <div className="announcement-editor-grid">
          <label className="announcement-editor-full">公告標題
            <input maxLength={120} value={input.title} onChange={event => setInput(current => ({ ...current, title: event.target.value }))} placeholder="請輸入公告標題" />
            <small>{input.title.length} / 120</small>
          </label>
          <label className="announcement-editor-full">公告內容
            <textarea data-enter-action="multiline" maxLength={2000} rows={8} value={input.body} onChange={event => setInput(current => ({ ...current, body: event.target.value }))} placeholder="請輸入純文字公告內容" />
            <small>{input.body.length} / 2000；按 Shift + Enter 可在內容中換行。</small>
          </label>
          <label>重要程度
            <select value={input.priority} onChange={event => setInput(current => ({ ...current, priority: Number(event.target.value) as 1 | 2 | 3 }))}>
              <option value={1}>一般</option>
              <option value={2}>重要</option>
              <option value={3}>緊急</option>
            </select>
          </label>
          <label>發佈時間
            <input type="datetime-local" value={input.published_at || ''} onChange={event => setInput(current => ({ ...current, published_at: event.target.value || null }))} />
            <small>留空時，發佈操作將立即生效。</small>
          </label>
          <label>下架時間
            <input type="datetime-local" value={input.expires_at || ''} onChange={event => setInput(current => ({ ...current, expires_at: event.target.value || null }))} />
            <small>留空代表不自動下架。</small>
          </label>
          <fieldset className="announcement-audience announcement-editor-full">
            <legend>公告對象</legend>
            <label><input type="checkbox" checked={input.audience_all} onChange={event => setInput(current => ({ ...current, audience_all: event.target.checked, audience_admin: event.target.checked ? false : current.audience_admin, audience_manager: event.target.checked ? false : current.audience_manager }))} />全體使用者</label>
            <label><input type="checkbox" checked={input.audience_admin} disabled={input.audience_all} onChange={event => setInput(current => ({ ...current, audience_all: false, audience_admin: event.target.checked }))} />系統管理員</label>
            <label><input type="checkbox" checked={input.audience_manager} disabled={input.audience_all} onChange={event => setInput(current => ({ ...current, audience_all: false, audience_manager: event.target.checked }))} />資料夾管理員及協同管理員</label>
            {!audienceValid && <small className="danger-text">請至少選擇一種公告對象。</small>}
          </fieldset>
          {editorItem?.status === 1 && <p className="announcement-revision-note announcement-editor-full">儲存已發佈公告後，版次將增加，所有對象都必須重新標示為已讀。</p>}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(archiveItem)}
        onClose={() => { if (!saving) setArchiveItem(null); }}
        title="封存公告"
        footer={<>
          <button className="btn btn-secondary" disabled={saving} onClick={() => setArchiveItem(null)}>取消</button>
          <button className="btn btn-danger" disabled={saving} onClick={() => void archive()}>{saving ? '處理中...' : '確認封存'}</button>
        </>}
      >
        <p>確定封存「{archiveItem?.title}」？封存後公告將立即停止顯示，且無法重新發佈。</p>
      </Modal>
    </section>
  );
};
