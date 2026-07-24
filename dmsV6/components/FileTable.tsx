import React from 'react';
import { createPortal } from 'react-dom';
import { DMSItem } from '../types';
import {
  FolderIcon,
  FolderOpenIcon,
  CloudDownloadIcon,
  CloudUploadIcon,
  EditIcon,
  DeleteIcon,
  HistoryIcon,
  CheckCircleIcon,
  ErrorOutlineIcon
} from './Icons';

const KeyIcon = ({ size = 18, style }: { size?: number, style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', ...style }}>
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const CoManagerIcon = ({ size = 18 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M3 19c.5-3.3 2.5-5 6-5s5.5 1.7 6 5" />
    <path d="M15 14c3.2 0 5 1.5 5.5 4" />
  </svg>
);

const RelatedDocumentIcon = ({ size = 18 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3v7a4 4 0 0 0 4 4h8" />
    <path d="m15 11 3 3-3 3" />
  </svg>
);

type DocumentIconKind = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'image' | 'document';
type DocumentIconSize = 18 | 24;

const DOCUMENT_ICON_KIND_BY_EXTENSION: Record<string, DocumentIconKind> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  xls: 'excel',
  xlsx: 'excel',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  tif: 'image',
  tiff: 'image',
  webp: 'image'
};

const getDocumentIconKind = (item: DMSItem): DocumentIconKind => {
  const extension = item.file_name?.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (extension && DOCUMENT_ICON_KIND_BY_EXTENSION[extension]) {
    return DOCUMENT_ICON_KIND_BY_EXTENSION[extension];
  }

  const mime = item.mime?.split(';', 1)[0].trim().toLowerCase() || '';
  if (mime === 'application/pdf' || item.is_pdf) return 'pdf';
  if (mime === 'application/msword' || mime.includes('wordprocessingml')) return 'word';
  if (mime === 'application/vnd.ms-excel' || mime.includes('spreadsheetml')) return 'excel';
  if (mime === 'application/vnd.ms-powerpoint' || mime.includes('presentationml')) return 'powerpoint';
  if (mime.startsWith('image/')) return 'image';

  return 'document';
};

const DocumentTypeIcon = ({ item, size }: { item: DMSItem; size: DocumentIconSize }) => {
  const iconKind = getDocumentIconKind(item);

  return (
    <img
      className="document-type-icon"
      src={`/icons/document-icons/generated/${iconKind}-${size}.png`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
};

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
  onCreateRelatedDocument?: (item: DMSItem) => void;
  onEditDocument?: (item: DMSItem) => void;
  onDeleteScheduledVersion?: (item: DMSItem) => void;
  onCancelVersion?: (item: DMSItem) => void;
  onObsoleteDocument?: (item: DMSItem) => void;
  onDeleteDocument?: (item: DMSItem) => void;
  onShowHistory?: (item: DMSItem) => void;
  onOpenContainingFolder?: (folderId: string) => void;
  showFolderPath?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
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
  onCreateRelatedDocument,
  onEditDocument,
  onDeleteScheduledVersion,
  onCancelVersion,
  onObsoleteDocument,
  onDeleteDocument,
  onShowHistory,
  onOpenContainingFolder,
  showFolderPath = false,
  emptyTitle = '此目錄下尚無項目',
  emptyDescription = '具備管理權限時，可以建立子資料夾或上傳正式文件。'
}) => {
  const [openActionId, setOpenActionId] = React.useState<string | null>(null);
  const [actionMenuPlacement, setActionMenuPlacement] = React.useState<React.CSSProperties | null>(null);
  const actionMenuRef = React.useRef<HTMLDivElement | null>(null);
  const actionMenuSourceRef = React.useRef<HTMLTableRowElement | null>(null);

  const closeActionMenu = React.useCallback((restoreFocus = false) => {
    setOpenActionId(null);
    setActionMenuPlacement(null);

    if (restoreFocus) {
      window.requestAnimationFrame(() => actionMenuSourceRef.current?.focus());
    }
  }, []);

  React.useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (e && e.type === 'click') {
        const target = e.target as HTMLElement;
        if (target?.closest && target.closest('.action-menu-list')) {
          return;
        }
      }
      closeActionMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && actionMenuRef.current) {
        closeActionMenu(true);
      }
    };
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target?.closest && target.closest('.action-menu-list')) {
        return;
      }
      closeActionMenu();
    };
    const handleResize = () => closeActionMenu();

    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [closeActionMenu]);

  React.useEffect(() => {
    if (!openActionId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      actionMenuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [openActionId]);

  type ActionMenuItem = {
    key: string;
    label: string;
    icon: React.ReactNode;
    className?: string;
    onClick: () => void;
  };

  // 動態渲染項目圖示
  const renderItemIcon = (item: DMSItem) => {
    if (item.type === 'document') {
      return <DocumentTypeIcon item={item} size={24} />;
    }

    return item.status === 'Archived'
      ? <FolderOpenIcon className="icon folder-icon" size={24} style={{ color: 'var(--color-warning)' }} />
      : <FolderIcon className="icon folder-icon" size={24} style={{ color: 'hsl(45, 95%, 60%)' }} />;
  };

  // 渲染資料夾屬性 Badge
  const renderAccessBadge = (item: DMSItem) => {
    if (item.type === 'document') {
      if (item.status === 'Scheduled') {
        const effectiveDate = item.effective_at?.split(' ')[0] || '-';
        return (
          <span
            className="badge-access scheduled"
            title={`生效日期：${effectiveDate}`}
          >
            即將生效
          </span>
        );
      }

      return (
        <span className="badge-access public">
          {item.version || '-'}
        </span>
      );
    }

    if (item.access_type === 2) {
      const isInherited = Boolean(item.is_access_inherited);
      const hasDetailedAcl = Boolean(item.acl_summary?.trim());
      return (
        <span
          className={`badge-access restricted${isInherited ? ' inherited' : ''}`}
          title={isInherited
            ? `授權對象：${item.acl_summary || '未設定詳細授權'}`
            : item.acl_summary
              ? `授權對象：${item.acl_summary}`
              : '限閱：未設定詳細授權'}
        >
          <span>限閱</span>
          {hasDetailedAcl
            ? <CheckCircleIcon size={16} aria-hidden="true" />
            : <ErrorOutlineIcon size={16} aria-hidden="true" />}
        </span>
      );
    }

    return (
      <span className="badge-access public" title="此資料夾已公開，任何登入同仁皆可見並可進入">
        公開
      </span>
    );
  };

  const renderManagerRoleIcon = (item: DMSItem) => {
    if (item.manager_role === 'CO_MANAGER') {
      return (
        <span className="manager-role-icon co-manager" title="您是此資料夾的協同管理員" aria-label="您是此資料夾的協同管理員">
          <CoManagerIcon />
        </span>
      );
    }

    return null;
  };

  const getActionItems = (item: DMSItem): ActionMenuItem[] => {
    if (item.type === 'document') {
      const activeVersionCount = item.versions?.filter(
        (version) => version.status !== 'Cancelled'
      ).length || 0;
      const actions: ActionMenuItem[] = [
        item.can_preview
          ? {
              key: 'preview',
              label: item.is_pdf ? '線上預覽 PDF' : '開新視窗預覽',
              icon: <DocumentTypeIcon item={item} size={18} />,
              onClick: () => onPreviewDocument?.(item)
            }
          : {
              key: 'download',
              label: '下載正式檔案',
              icon: <CloudDownloadIcon size={18} />,
              onClick: () => onDownloadDocument?.(item)
            }
      ];

      if (onOpenContainingFolder && item.folder_id) {
        actions.push({
          key: 'open-containing-folder',
          label: '前往所在資料夾',
          icon: <FolderOpenIcon size={18} />,
          onClick: () => onOpenContainingFolder(item.folder_id!)
        });
      }

      if (item.can_preview && (!item.is_pdf || item.can_manage)) {
        actions.push({
          key: 'download-previewable',
          label: item.is_pdf ? '下載正式 PDF' : '下載正式檔案',
          icon: <CloudDownloadIcon size={18} />,
          onClick: () => onDownloadDocument?.(item)
        });
      }

      if (item.can_manage) {
        if (!item.parent_document_id && item.status !== 'Obsolete') {
          actions.push({
            key: 'create-related-document',
            label: '新增相關文件',
            icon: <RelatedDocumentIcon size={18} />,
            onClick: () => onCreateRelatedDocument?.(item)
          });
        }

        actions.push({
          key: 'edit-document',
          label: '修改文件',
          icon: <EditIcon size={18} />,
          onClick: () => onEditDocument?.(item)
        });

        if (item.status === 'Scheduled') {
          actions.push({
            key: 'delete-scheduled-version',
            label: '刪除預約版本',
            icon: <DeleteIcon size={18} />,
            className: 'menu-item-warning',
            onClick: () => onDeleteScheduledVersion?.(item)
          });
        } else if (!item.has_scheduled_version) {
          actions.push({
            key: 'upload-version',
            label: '上傳新版',
            icon: <CloudUploadIcon size={18} />,
            onClick: () => onUploadVersion?.(item)
          });
        }

        if (item.status !== 'Scheduled' && !item.has_scheduled_version && activeVersionCount > 1) {
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

        if (item.status === 'Scheduled') {
          return actions;
        }

        if (!item.parent_document_id && (item.related_document_count || 0) > 0) {
          actions.push({
            key: 'delete-document-group',
            label: '刪除文件',
            icon: <DeleteIcon size={18} />,
            className: 'menu-item-warning',
            onClick: () => onDeleteDocument?.(item)
          });
        } else if (activeVersionCount === 1) {
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

    if (onSetAcl && !item.is_access_inherited) {
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

  const getActionId = (item: DMSItem) => `${item.type}-${item.id}-${item.ver_id || ''}`;

  const openActionMenu = (
    item: DMSItem,
    sourceRow: HTMLTableRowElement,
    requestedLeft: number,
    requestedTop: number
  ) => {
    const actions = getActionItems(item);
    if (actions.length === 0) {
      return false;
    }

    const viewportMargin = 8;
    const estimatedMenuWidth = 220;
    const estimatedMenuHeight = Math.min(
      actions.length * 36 + 12,
      window.innerHeight - viewportMargin * 2
    );
    const left = Math.min(
      Math.max(requestedLeft, viewportMargin),
      Math.max(window.innerWidth - estimatedMenuWidth - viewportMargin, viewportMargin)
    );
    const top = requestedTop + estimatedMenuHeight > window.innerHeight - viewportMargin
      ? Math.max(requestedTop - estimatedMenuHeight, viewportMargin)
      : Math.max(requestedTop, viewportMargin);

    actionMenuSourceRef.current = sourceRow;
    setActionMenuPlacement({
      top,
      left,
      maxHeight: window.innerHeight - viewportMargin * 2,
      overflowY: 'auto'
    });
    setOpenActionId(getActionId(item));
    return true;
  };

  const handleActionMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    );
    const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % menuItems.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex < 0
        ? menuItems.length - 1
        : (currentIndex - 1 + menuItems.length) % menuItems.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = menuItems.length - 1;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeActionMenu(true);
      return;
    }

    if (nextIndex !== null && menuItems[nextIndex]) {
      event.preventDefault();
      menuItems[nextIndex].focus();
    }
  };

  const renderActionMenu = () => {
    if (!openActionId || !actionMenuPlacement || typeof document === 'undefined') {
      return null;
    }

    const item = items.find(candidate => getActionId(candidate) === openActionId);
    if (!item) {
      return null;
    }

    const actions = getActionItems(item);
    if (actions.length === 0) {
      return null;
    }

    return createPortal(
      <div
        ref={actionMenuRef}
        className="action-menu-list action-menu-list-floating"
        role="menu"
        aria-label={`「${item.name}」的操作選單`}
        style={actionMenuPlacement}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={handleActionMenuKeyDown}
      >
        {actions.map(action => (
          <button
            key={action.key}
            type="button"
            className={`action-menu-item ${action.className || ''}`}
            role="menuitem"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              closeActionMenu();
              action.onClick();
            }}
          >
            <span className="action-menu-icon">{action.icon}</span>
            <span className="action-menu-label">{action.label}</span>
          </button>
        ))}
      </div>,
      document.body
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
        <h3>{emptyTitle}</h3>
        <p>{emptyDescription}</p>
      </div>
    );
  }

  return (
    <>
      <table id="files-table">
        <thead>
          <tr>
            <th style={{ width: '60%' }}>名稱</th>
            <th style={{ width: '18%' }}>文件編號</th>
            <th style={{ width: '10%' }}>屬性 / 版本</th>
            <th style={{ width: '12%' }}>修訂日期</th>
          </tr>
        </thead>
        <tbody id="files-list">
          {items.map((item, index) => {
            const previousItem = items[index - 1];
            const nextItem = items[index + 1];
            const isRelatedDocument = Boolean(item.parent_document_id);
            const isGroupedRelatedDocument = !showFolderPath && isRelatedDocument;
            const isFirstGroupedRelatedDocument = isGroupedRelatedDocument
              && previousItem?.parent_document_id !== item.parent_document_id;
            const isLastGroupedRelatedDocument = isGroupedRelatedDocument
              && nextItem?.parent_document_id !== item.parent_document_id;
            const isRelatedDocumentParentRow = !showFolderPath
              && !isRelatedDocument
              && Boolean(nextItem?.parent_document_id)
              && String(nextItem?.parent_document_id) === String(item.id);
            const rowClassNames = ['table-row'];
            const hasActions = getActionItems(item).length > 0;
            const isActionMenuOpen = openActionId === getActionId(item);

            if (isRelatedDocument) {
              rowClassNames.push('related-document-row');
            }
            if (isGroupedRelatedDocument) {
              rowClassNames.push('grouped-related-document-row');
            }
            if (isFirstGroupedRelatedDocument) {
              rowClassNames.push('related-document-row-first');
            }
            if (isLastGroupedRelatedDocument) {
              rowClassNames.push('related-document-row-last');
            }
            if (isRelatedDocumentParentRow) {
              rowClassNames.push('related-document-parent-row');
            }
            if (isActionMenuOpen) {
              rowClassNames.push('context-menu-active');
            }

            return (
              <tr
                key={`${item.type}-${item.id}-${item.ver_id || ''}`}
                className={rowClassNames.join(' ')}
                onClick={() => handleRowClick(item)}
                onContextMenu={(event) => {
                  if (!hasActions) {
                    closeActionMenu();
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  openActionMenu(
                    item,
                    event.currentTarget,
                    event.clientX,
                    event.clientY
                  );
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }

                  if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
                    if (!hasActions) {
                      return;
                    }

                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    openActionMenu(
                      item,
                      event.currentTarget,
                      rect.left + Math.min(rect.width, 32),
                      rect.top + Math.min(rect.height, 32)
                    );
                    return;
                  }

                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleRowClick(item);
                  }
                }}
                tabIndex={0}
                aria-haspopup={hasActions ? 'menu' : undefined}
                aria-expanded={hasActions ? isActionMenuOpen : undefined}
              >
                <td>
                  <div className="name-cell">
                    {item.parent_document_id && (
                      <span className="related-document-branch" title="相關文件">
                        {!isGroupedRelatedDocument && <RelatedDocumentIcon size={18} />}
                      </span>
                    )}
                    {renderItemIcon(item)}
                    <span className="name-text">
                      {showFolderPath && item.folder_path && (
                        <button
                          type="button"
                          className="folder-path-link"
                          title={`前往資料夾：${item.folder_path}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (item.folder_id) {
                              onOpenContainingFolder?.(item.folder_id);
                            }
                          }}
                        >
                          {item.folder_path}
                        </button>
                      )}
                      {showFolderPath && item.parent_document_id && item.parent_title && (
                        <span className="related-document-context">
                          隸屬於：{[item.parent_code, item.parent_title].filter(Boolean).join(' ')}
                        </span>
                      )}
                      <span className="item-name">{item.name}</span>
                    </span>
                  </div>
                </td>
                <td>
                  <div className="document-code-cell">
                    {renderManagerRoleIcon(item)}
                    <span>
                      {item.type === 'document' ? (item.code || '') : ''}
                    </span>
                  </div>
                </td>
                <td>
                  {renderAccessBadge(item)}
                </td>
                <td>{item.type === 'document' ? (item.revision_date || '-') : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {renderActionMenu()}
    </>
  );
});

FileTable.displayName = 'FileTable';
