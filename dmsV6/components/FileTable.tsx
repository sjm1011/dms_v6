import React from 'react';
import { createPortal } from 'react-dom';
import { DMSItem } from '../types';
import {
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  PdfIcon,
  CloudDownloadIcon,
  CloudUploadIcon,
  EditIcon,
  DeleteIcon,
  HistoryIcon,
  CloseIcon
} from './Icons';

const KeyIcon = ({ size = 18, style }: { size?: number, style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', ...style }}>
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);



interface FileTableProps {
  items: DMSItem[];
  onEnterFolder: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onArchiveFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string, name: string) => void;
  onSetAcl?: (id: string, name: string) => void;
  onPreviewDocument?: (item: DMSItem) => void;
  onDownloadDocument?: (item: DMSItem) => void;
  onUploadVersion?: (item: DMSItem) => void;
  onCancelVersion?: (item: DMSItem) => void;
  onObsoleteDocument?: (item: DMSItem) => void;
  onDeleteDocument?: (item: DMSItem) => void;
  onShowHistory?: (item: DMSItem) => void;
}

export const FileTable = React.memo<FileTableProps>(({
  items,
  onEnterFolder,
  onRename,
  onArchiveFolder,
  onDeleteFolder,
  onSetAcl,
  onPreviewDocument,
  onDownloadDocument,
  onUploadVersion,
  onCancelVersion,
  onObsoleteDocument,
  onDeleteDocument,
  onShowHistory
}) => {
  const [openActionId, setOpenActionId] = React.useState<string | null>(null);
  const [actionMenuPlacement, setActionMenuPlacement] = React.useState<React.CSSProperties | null>(null);

  React.useEffect(() => {
    const closeActionMenu = (e?: Event) => {
      if (e && e.type === 'click') {
        const target = e.target as HTMLElement;
        if (target?.closest && (target.closest('.action-menu-trigger') || target.closest('.action-menu-list'))) {
          return;
        }
      }
      setOpenActionId(null);
      setActionMenuPlacement(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeActionMenu();
      }
    };
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target?.closest && target.closest('.action-menu-list')) {
        return;
      }
      closeActionMenu();
    };

    document.addEventListener('click', closeActionMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', closeActionMenu);

    return () => {
      document.removeEventListener('click', closeActionMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', closeActionMenu);
    };
  }, []);

  type ActionMenuItem = {
    key: string;
    label: string;
    icon: React.ReactNode;
    className?: string;
    onClick: () => void;
  };

  // 動態渲染資料夾圖示
  const renderItemIcon = (item: DMSItem) => {
    if (item.type === 'document') {
      return item.is_pdf || item.mime?.toLowerCase().includes('pdf')
        ? <PdfIcon className="icon" size={24} style={{ color: 'var(--color-danger)' }} />
        : <FileIcon className="icon" size={24} style={{ color: 'var(--accent-cyan)' }} />;
    }

    return item.status === 'Archived'
      ? <FolderOpenIcon className="icon folder-icon" size={24} style={{ color: 'var(--color-warning)' }} />
      : <FolderIcon className="icon folder-icon" size={24} style={{ color: 'hsl(45, 95%, 60%)' }} />;
  };

  // 渲染資料夾屬性 Badge
  const renderAccessBadge = (item: DMSItem) => {
    if (item.type === 'document') {
      return (
        <span className="badge-access public">
          {item.version || '-'}
        </span>
      );
    }

    if (item.access_type === 2) {
      return (
        <span className="badge-access restricted" title={item.acl_summary ? `授權對象：${item.acl_summary}` : '限閱：未設定詳細授權'}>
          限閱
        </span>
      );
    }

    return (
      <span className="badge-access public" title="此資料夾已公開，任何登入同仁皆可見並可進入">
        公開
      </span>
    );
  };

  const getActionItems = (item: DMSItem): ActionMenuItem[] => {
    if (item.type === 'document') {
      const actions: ActionMenuItem[] = [
        item.can_preview
          ? {
              key: 'preview',
              label: item.is_pdf ? '線上預覽 PDF' : '開新視窗預覽',
              icon: item.is_pdf ? <PdfIcon size={18} /> : <FileIcon size={18} />,
              onClick: () => onPreviewDocument?.(item)
            }
          : {
              key: 'download',
              label: '下載正式檔案',
              icon: <CloudDownloadIcon size={18} />,
              onClick: () => onDownloadDocument?.(item)
            }
      ];

      if (item.can_manage) {
        if (item.can_preview) {
          actions.push({
            key: 'download-previewable',
            label: item.is_pdf ? '下載正式 PDF' : '下載正式檔案',
            icon: <CloudDownloadIcon size={18} />,
            onClick: () => onDownloadDocument?.(item)
          });
        }

        actions.push({
          key: 'upload-version',
          label: '上傳新版',
          icon: <CloudUploadIcon size={18} />,
          onClick: () => onUploadVersion?.(item)
        });

        if (item.versions && item.versions.length > 1) {
          actions.push({
            key: 'cancel-version',
            label: '撤回最新版本',
            icon: <HistoryIcon size={18} />,
            onClick: () => onCancelVersion?.(item)
          });
        }

        actions.push({
          key: 'history',
          label: '版本歷史',
          icon: <HistoryIcon size={18} />,
          onClick: () => onShowHistory?.(item)
        });

        if (item.versions && item.versions.length === 1) {
          actions.push({
            key: 'delete-document',
            label: '刪除文件',
            icon: <DeleteIcon size={18} />,
            className: 'menu-item-warning',
            onClick: () => onDeleteDocument?.(item)
          });
        } else {
          actions.push({
            key: 'obsolete-document',
            label: '廢止文件',
            icon: <DeleteIcon size={18} />,
            className: 'menu-item-warning',
            onClick: () => onObsoleteDocument?.(item)
          });
        }
      }

      return actions;
    }

    if (!item.can_manage) {
      return [];
    }

    const actions: ActionMenuItem[] = [];

    if (onSetAcl) {
      actions.push({
        key: 'acl',
        label: '屬性設定',
        icon: <KeyIcon size={18} />,
        className: 'menu-item-accent',
        onClick: () => onSetAcl(item.id, item.name)
      });
    }

    actions.push({
      key: 'rename',
      label: '修改資料夾',
      icon: <EditIcon size={18} />,
      onClick: () => onRename(item.id, item.name)
    });

    if (item.is_empty_folder) {
      actions.push({
        key: 'delete-folder',
        label: '刪除（作廢）',
        icon: <DeleteIcon size={18} />,
        className: 'menu-item-warning',
        onClick: () => onDeleteFolder(item.id, item.name)
      });
    } else {
      actions.push({
        key: 'archive-folder',
        label: '封存資料夾',
        icon: <DeleteIcon size={18} />,
        className: 'menu-item-warning',
        onClick: () => onArchiveFolder(item.id, item.name)
      });
    }

    return actions;
  };

  const renderActionMenu = (item: DMSItem) => {
    const actionId = `${item.type}-${item.id}`;
    const actions = getActionItems(item);
    const isOpen = openActionId === actionId;

    if (actions.length === 0) {
      return null;
    }

    const actionMenuList = isOpen && actionMenuPlacement && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="action-menu-list action-menu-list-floating"
            role="menu"
            style={actionMenuPlacement}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px' }}>
              <button
                type="button"
                className="btn-icon"
                title="關閉選單"
                style={{ padding: '4px', margin: 0, minHeight: 'auto', background: 'transparent' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenActionId(null);
                  setActionMenuPlacement(null);
                }}
              >
                <CloseIcon size={16} />
              </button>
            </div>
            {actions.map(action => (
              <button
                key={action.key}
                type="button"
                className={`action-menu-item ${action.className || ''}`}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenActionId(null);
                  setActionMenuPlacement(null);
                  action.onClick();
                }}
              >
                <span className="action-menu-icon">{action.icon}</span>
                <span className="action-menu-label">{action.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

    return (
      <div className="action-menu" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn-icon action-menu-trigger"
          title="開啟操作選單"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={(e) => {
            e.stopPropagation();
            if (isOpen) {
              setOpenActionId(null);
              setActionMenuPlacement(null);
              return;
            }

            const rect = e.currentTarget.getBoundingClientRect();
            const estimatedMenuHeight = Math.min(actions.length * 40 + 12, window.innerHeight - 16);
            const top = rect.bottom + 6 + estimatedMenuHeight > window.innerHeight
              ? Math.max(rect.top - estimatedMenuHeight - 6, 8)
              : rect.bottom + 6;

            setActionMenuPlacement({
              top,
              right: Math.max(window.innerWidth - rect.right, 8),
              maxHeight: window.innerHeight - 16,
              overflowY: 'auto'
            });
            setOpenActionId(actionId);
          }}
        >
          <span aria-hidden="true">...</span>
        </button>

        {actionMenuList}
      </div>
    );
  };

  const handleRowClick = (item: DMSItem) => {
    if (item.type === 'folder') {
      onEnterFolder(item.id);
      return;
    }

    if (item.can_preview) {
      onPreviewDocument?.(item);
    } else {
      onDownloadDocument?.(item);
    }
  };

  if (items.length === 0) {
    return (
      <div id="empty-state" className="empty-state">
        <FolderOpenIcon size={64} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
        <h3>此目錄下尚無項目</h3>
        <p>具備管理權限時，可以建立子資料夾或上傳正式文件。</p>
      </div>
    );
  }

  return (
    <>
      <table id="files-table">
        <thead>
          <tr>
            <th style={{ width: '36%' }}>名稱</th>
            <th style={{ width: '24%' }}>文件編號</th>
            <th style={{ width: '10%' }}>屬性 / 版本</th>
            <th style={{ width: '14%' }}>修訂日期</th>
            <th style={{ width: '16%', textAlign: 'right' }}>操作</th>
          </tr>
        </thead>
        <tbody id="files-list">
          {items.map(item => {
            return (
              <tr
                key={`${item.type}-${item.id}`}
                className="table-row"
                onClick={() => handleRowClick(item)}
              >
                <td>
                  <div className="name-cell">
                    {renderItemIcon(item)}
                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </span>
                  </div>
                </td>
                <td>
                  <span style={{ display: 'block', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.type === 'document' ? (item.code || '-') : '-'}
                  </span>
                </td>
                <td>
                  {renderAccessBadge(item)}
                </td>
                <td>{item.type === 'document' ? (item.revision_date || '-') : ''}</td>
                <td className="action-cell">
                  {renderActionMenu(item)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
});

FileTable.displayName = 'FileTable';
