'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardAPI } from '../api/dashboard';
import { DocumentsAPI } from '../api/documents';
import type {
  DashboardAnnouncement,
  DashboardData,
  DashboardDocumentItem,
  SystemPage,
  User
} from '../types';
import {
  ArrowForwardIcon,
  CheckCircleIcon,
  ErrorOutlineIcon,
  FileIcon,
  HistoryIcon,
  InfoIcon
} from './Icons';
import { DocumentTypeIcon } from './DocumentTypeIcon';
import { Modal } from './Modal';

interface DashboardProps {
  user: User;
  onOpenDocument: (folderId: string, documentId: string) => void;
  onOpenSystemPage: (page: SystemPage) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const priorityLabel = (priority: number) => priority === 3 ? '緊急' : priority === 2 ? '重要' : '一般';

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.split(/[ T]/, 1)[0];
  return date.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const DocumentList: React.FC<{
  items: DashboardDocumentItem[];
  emptyText: string;
  recentPresentation?: boolean;
  onPreview: (item: DashboardDocumentItem) => void;
  onOpenDocument: DashboardProps['onOpenDocument'];
}> = ({ items, emptyText, recentPresentation = false, onPreview, onOpenDocument }) => {
  if (items.length === 0) {
    return <p className="dashboard-empty-text">{emptyText}</p>;
  }

  return (
    <div className="dashboard-document-list">
      {items.map(item => (
        <article className="dashboard-document-item" key={`${item.document_id}-${item.version_id}`}>
          <div className="dashboard-document-icon">
            {recentPresentation ? <DocumentTypeIcon item={item} size={24} /> : <FileIcon size={20} />}
          </div>
          <div className="dashboard-document-main">
            <div className="dashboard-document-title">
              {item.code ? <span>{item.code}</span> : null}
              <strong>{item.title}</strong>
              <span className="dashboard-version-chip">
                {item.version || (recentPresentation ? `第 ${item.version_sequence} 版` : '未編版號')}
              </span>
            </div>
            {recentPresentation ? (
              <p className="dashboard-document-meta">
                <span>發行日期：{formatDate(item.effective_at)}</span>
                <span className="dashboard-document-path">{item.folder_path}</span>
              </p>
            ) : (
              <>
                <p>{item.folder_path}</p>
                <small>發佈時間：{formatDateTime(item.effective_at)}</small>
              </>
            )}
          </div>
          <div className="dashboard-document-actions">
            {item.can_preview && (
              <button className="btn btn-secondary btn-small" onClick={() => onPreview(item)}>檢視</button>
            )}
            <button className="btn btn-secondary btn-small" onClick={() => onOpenDocument(item.folder_id, item.document_id)}>
              前往文件
            </button>
          </div>
        </article>
      ))}
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({
  user,
  onOpenDocument,
  onOpenSystemPage,
  showToast
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<DashboardAnnouncement | null>(null);
  const [markingRead, setMarkingRead] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await DashboardAPI.getDashboard();
      setData(response.data);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleAnnouncements = useMemo(
    () => showAllAnnouncements ? data?.announcements || [] : (data?.announcements || []).slice(0, 5),
    [data?.announcements, showAllAnnouncements]
  );

  const previewDocument = async (item: DashboardDocumentItem) => {
    try {
      await DocumentsAPI.previewVersion(item.version_id, item.title, item.revision_date);
    } catch (error) {
      showToast('預覽文件失敗：' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  };

  const markRead = async () => {
    if (!selectedAnnouncement || selectedAnnouncement.is_read) return;
    setMarkingRead(true);
    try {
      await DashboardAPI.markAnnouncementRead(
        selectedAnnouncement.announcement_id,
        selectedAnnouncement.revision
      );
      setData(current => current ? {
        ...current,
        announcement_summary: {
          ...current.announcement_summary,
          unread: Math.max(0, current.announcement_summary.unread - 1),
          urgent_unread: selectedAnnouncement.priority === 3
            ? Math.max(0, current.announcement_summary.urgent_unread - 1)
            : current.announcement_summary.urgent_unread
        },
        announcements: current.announcements.map(item => item.announcement_id === selectedAnnouncement.announcement_id
          ? { ...item, is_read: true }
          : item)
      } : current);
      setSelectedAnnouncement(current => current ? { ...current, is_read: true } : current);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
      await load();
    } finally {
      setMarkingRead(false);
    }
  };

  return (
    <div className="dashboard-page fade-in">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">文件管理系統</p>
          <h1>儀表板</h1>
          <p>{user.name}，以下是目前需要留意的公告與文件資訊。</p>
        </div>
        <button className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
          {loading ? '載入中...' : '重新整理'}
        </button>
      </header>

      {data?.section_errors.map(error => (
        <div className="dashboard-section-error" role="status" key={error.section}>
          <ErrorOutlineIcon size={18} />
          <span>{error.message}</span>
        </div>
      ))}

      <div className="dashboard-stat-grid" aria-label="儀表板摘要">
        <section className="dashboard-stat-card">
          <span>未讀公告</span>
          <strong>{data?.announcement_summary.unread ?? 0}</strong>
          <small>{data?.announcement_summary.urgent_unread ? `${data.announcement_summary.urgent_unread} 則緊急公告未讀` : '目前沒有未讀緊急公告'}</small>
        </section>
        <section className="dashboard-stat-card">
          <span>近期發佈的文件</span>
          <strong>{data?.recent_documents.total ?? 0}</strong>
          <small>僅統計目前可存取的有效文件</small>
        </section>
        {data?.manager_summary && (
          <section className="dashboard-stat-card">
            <span>30 天內預約發佈</span>
            <strong>{data.manager_summary.total}</strong>
            <small>目前管理範圍內的文件版本</small>
          </section>
        )}
        {user.role === 'ADMIN' && (
          <section className={`dashboard-stat-card ${data?.admin_alerts.length ? 'has-warning' : ''}`}>
            <span>系統異常提醒</span>
            <strong>{data?.admin_alerts.length ?? 0}</strong>
            <small>{data?.admin_alerts.length ? '請檢查下方異常摘要' : '目前沒有偵測到異常'}</small>
          </section>
        )}
      </div>

      <div className="dashboard-content-grid">
        <section className="dashboard-panel dashboard-announcement-panel">
          <div className="dashboard-panel-header">
            <div><h2>重要公告</h2><p>共 {data?.announcement_summary.total ?? 0} 則有效公告</p></div>
            {(data?.announcements.length || 0) > 5 && (
              <button className="btn btn-secondary btn-small" onClick={() => setShowAllAnnouncements(value => !value)}>
                {showAllAnnouncements ? '收合公告' : '查看全部公告'}
              </button>
            )}
          </div>
          {loading && !data ? (
            <p className="dashboard-empty-text">公告載入中...</p>
          ) : visibleAnnouncements.length === 0 ? (
            <p className="dashboard-empty-text">目前沒有有效公告。</p>
          ) : (
            <div className="dashboard-announcement-list">
              {visibleAnnouncements.map(item => (
                <button
                  type="button"
                  className={`dashboard-announcement-card priority-${item.priority} ${item.is_read ? 'is-read' : 'is-unread'}`}
                  key={`${item.announcement_id}-${item.revision}`}
                  onClick={() => setSelectedAnnouncement(item)}
                >
                  <span className="dashboard-announcement-priority">{priorityLabel(item.priority)}</span>
                  <span className="dashboard-announcement-content">
                    <strong>{item.title}</strong>
                    <small>發佈時間：{formatDateTime(item.published_at)}</small>
                  </span>
                  {!item.is_read && <span className="dashboard-unread-dot">未讀</span>}
                  <ArrowForwardIcon size={18} />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div><h2>近期發佈的文件</h2></div>
            <HistoryIcon size={22} />
          </div>
          <DocumentList
            items={data?.recent_documents.items || []}
            emptyText={loading && !data ? '文件載入中...' : '近 30 天沒有新發佈的文件。'}
            recentPresentation
            onPreview={(item) => void previewDocument(item)}
            onOpenDocument={onOpenDocument}
          />
        </section>
      </div>

      {data?.manager_summary && (
        <section className="dashboard-panel dashboard-wide-panel">
          <div className="dashboard-panel-header">
            <div><h2>預約發佈提醒</h2><p>管理範圍內，未來 30 天將發佈的文件</p></div>
            <InfoIcon size={22} />
          </div>
          <DocumentList
            items={data.manager_summary.items}
            emptyText="未來 30 天沒有預約發佈的文件。"
            onPreview={(item) => void previewDocument(item)}
            onOpenDocument={onOpenDocument}
          />
        </section>
      )}

      {user.role === 'ADMIN' && (
        <section className="dashboard-panel dashboard-wide-panel">
          <div className="dashboard-panel-header">
            <div><h2>系統異常摘要</h2><p>只顯示需要管理員處理的項目</p></div>
            {data?.admin_alerts.length === 0 && <CheckCircleIcon className="success-text" size={22} />}
          </div>
          {data?.admin_alerts.length ? (
            <div className="dashboard-alert-list">
              {data.admin_alerts.map(alert => (
                <button key={alert.id} className={`dashboard-alert-card ${alert.level}`} onClick={() => onOpenSystemPage(alert.target)}>
                  <ErrorOutlineIcon size={20} />
                  <span><strong>{alert.title}</strong><small>{alert.message}</small></span>
                  <ArrowForwardIcon size={18} />
                </button>
              ))}
            </div>
          ) : (
            <p className="dashboard-empty-text">目前沒有偵測到系統異常。</p>
          )}
        </section>
      )}

      <Modal
        isOpen={Boolean(selectedAnnouncement)}
        onClose={() => setSelectedAnnouncement(null)}
        title={selectedAnnouncement?.title || '公告內容'}
        contentClassName="dashboard-announcement-modal"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setSelectedAnnouncement(null)}>關閉</button>
          {!selectedAnnouncement?.is_read && (
            <button className="btn btn-primary" disabled={markingRead} onClick={() => void markRead()}>
              {markingRead ? '處理中...' : '標示為已讀'}
            </button>
          )}
        </>}
      >
        {selectedAnnouncement && <>
          <div className="dashboard-announcement-meta">
            <span className={`priority-badge priority-${selectedAnnouncement.priority}`}>{priorityLabel(selectedAnnouncement.priority)}</span>
            <span>第 {selectedAnnouncement.revision} 版</span>
            <span>發佈時間：{formatDateTime(selectedAnnouncement.published_at)}</span>
            {selectedAnnouncement.expires_at && <span>下架時間：{formatDateTime(selectedAnnouncement.expires_at)}</span>}
          </div>
          <div className="dashboard-announcement-body">{selectedAnnouncement.body}</div>
        </>}
      </Modal>
    </div>
  );
};
