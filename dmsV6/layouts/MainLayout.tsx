import React, { useState, useMemo, useCallback } from 'react';
import { User, Folder, DMSItem, Document } from '../types';
import { Sidebar } from '../components/Sidebar';
import { FileTable } from '../components/FileTable';
import { useDocuments } from '../hooks/useDocuments';
import { DocumentsAPI } from '../api/documents';
import {
  SearchIcon,
  CreateNewFolderIcon,
  CloudUploadIcon
} from '../components/Icons';

// 匯入分流後的 Modals 
import { NewFolderModal, RenameModal, ArchiveFolderModal, DeleteFolderModal } from '../components/Modals/FolderModals';
import { ErrorDetailModal, TestResultModal } from '../components/Modals/FeedbackModals';
import { FolderAclModal } from '../components/Modals/FolderAclModal';
import { NewDocModal, UploadVerModal, ObsoleteDocModal, DeleteDocModal, CancelVersionModal, HistoryModal } from '../components/Modals/DocumentModals';

interface MainLayoutProps {
  user: User;
  onLogout: () => void;
  // Folders Hooks
  folders: Folder[];
  isLoadingFolders: boolean;
  hasLoadedFolders: boolean;
  currentFolderId: string;
  setCurrentFolderId: (id: string) => void;
  expandedFolders: Set<string>;
  handleToggleExpand: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  handleCreateFolder: (name: string, managers?: string[]) => Promise<boolean>;
  handleRenameFolder: (id: string, newName: string, managers?: string[]) => Promise<boolean>;
  handleArchiveFolder: (id: string, name: string) => Promise<boolean>;
  handleDeleteFolder: (id: string, name: string) => Promise<boolean>;
  fetchFolders: () => Promise<void>;
  // Feedback / Debug
  testResult: { success: boolean; data?: any; error?: string } | null;
  setTestResult: (res: any) => void;
  errorDetail: { title: string; message: string } | null;
  handleCloseErrorModal: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  user,
  onLogout,
  folders,
  isLoadingFolders,
  hasLoadedFolders,
  currentFolderId,
  setCurrentFolderId,
  expandedFolders,
  handleToggleExpand,
  searchQuery,
  setSearchQuery,
  handleCreateFolder,
  handleRenameFolder,
  handleArchiveFolder,
  handleDeleteFolder,
  fetchFolders,
  testResult,
  setTestResult,
  errorDetail,
  handleCloseErrorModal,
  showToast
}) => {
  // --- UI 本地控制狀態 ---
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState('');
  const [renameValue, setRenameValue] = useState('');

  const [isArchiveFolderOpen, setIsArchiveFolderOpen] = useState(false);
  const [isDeleteFolderOpen, setIsDeleteFolderOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<{ id: string; name: string } | null>(null);

  const [isFolderAclOpen, setIsFolderAclOpen] = useState(false);
  const [aclFolder, setAclFolder] = useState<{ id: string; name: string } | null>(null);

  const [isNewDocOpen, setIsNewDocOpen] = useState(false);
  const [isUploadVerOpen, setIsUploadVerOpen] = useState(false);
  const [isObsoleteDocOpen, setIsObsoleteDocOpen] = useState(false);
  const [isDeleteDocOpen, setIsDeleteDocOpen] = useState(false);
  const [isCancelVersionOpen, setIsCancelVersionOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);

  const isAdmin = user.role === 'ADMIN';

  // 預先建立資料夾的 Dictionary 結構，將陣列搜尋的時間複雜度從 O(M) 降為 O(1)
  const foldersById = useMemo(() => {
    const map = new Map<string, Folder>();
    folders.forEach(f => map.set(f.id.toString(), f));
    return map;
  }, [folders]);

  const currentFolder = currentFolderId ? foldersById.get(currentFolderId) || null : null;
  const currentFolderIsActive = currentFolderId === '' || currentFolder?.status === 1;
  const canLoadCurrentFolderDocuments = currentFolderId === '' || currentFolderIsActive;
  const documentsHook = useDocuments(user, currentFolderId, showToast, canLoadCurrentFolderDocuments);
  const isContentLoading = !hasLoadedFolders || isLoadingFolders || documentsHook.isLoadingDocuments;

  // 判定當前使用者是否為當前資料夾的區段管理員 (支援遞迴繼承上級管理員與根目錄系統管理員判定)
  const isFolderManager = useCallback((targetFolderId: string | null | undefined) => {
    if (user.role === 'ADMIN') return true;
    if (!targetFolderId) return false;

    // 遞迴向上追溯當前資料夾及其所有祖先的 managers 聯集
    let currentId: string | null | undefined = targetFolderId;
    let isManager = false;

    while (currentId) {
      const folder = foldersById.get(currentId.toString());
      if (!folder) break;

      if (folder.managers?.includes(user.id)) {
        isManager = true;
        break;
      }

      if (folder.parent_id) {
        currentId = folder.parent_id.toString();
      } else {
        break;
      }
    }

    if (isManager) return true;

    return false;
  }, [user.id, user.role, foldersById]);

  const isCurrentFolderManager = useCallback(() => isFolderManager(currentFolderId), [isFolderManager, currentFolderId]);

  // 根目錄下只有系統管理員可以新增第一層資料夾；子目錄下只有區段管理員可以新增子目錄
  const canCreateFolder = currentFolderIsActive && (currentFolderId === '' ? isAdmin : isCurrentFolderManager());
  const canCreateDocument = currentFolderIsActive && (currentFolderId === '' ? isAdmin : isCurrentFolderManager());

  const documentsById = useMemo(() => {
    const map = new Map<string, Document>();
    documentsHook.documents.forEach(doc => map.set(doc.id.toString(), doc));
    return map;
  }, [documentsHook.documents]);

  const formatFileSize = (size?: number) => {
    if (!size) return '-';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  };

  // 取得麵包屑
  const getBreadcrumbs = () => {
    const list: { id: string; name: string }[] = [];
    if (currentFolderId === '') return list;

    let target = folders.find(f => f.id === currentFolderId);
    while (target) {
      list.unshift({ id: target.id, name: target.name });
      if (target.parent_id) {
        target = folders.find(f => f.id === target!.parent_id);
      } else {
        break;
      }
    }
    return list;
  };

  // 取得當前目錄標題
  const getCurrentTitle = () => {
    if (currentFolderId === '') return '文件庫';
    const target = folders.find(f => f.id === currentFolderId);
    return target ? target.name : '目錄資料夾';
  };

  // 整合本層資料夾，供列表顯示與搜尋 (套用 useMemo 以避免無意義渲染)
  const combinedItems = useMemo(() => {
    let list: DMSItem[] = [];

    const currentSubFolders = folders.filter(f => f.status === 1 && f.parent_id === (currentFolderId || null));
    currentSubFolders.forEach(f => {
      const childFolderCount = f.child_folder_count || 0;
      const documentCount = f.document_count || 0;
      list.push({
        id: f.id,
        name: f.name,
        type: 'folder',
        size: '-',
        creator: '-',
        time: '-',
        status: 'Active',
        manager_names: f.manager_names,
        access_type: f.access_type,
        acl_summary: f.acl_summary,
        child_folder_count: childFolderCount,
        document_count: documentCount,
        is_empty_folder: childFolderCount === 0 && documentCount === 0,
        can_manage: isFolderManager(f.id)
          && f.status === 1
      });
    });

    documentsHook.documents.forEach(doc => {
      const currentVersion = doc.versions?.find(v => v.status === 'Effective') || doc.versions?.[0];
      list.push({
        id: doc.id,
        code: doc.code,
        name: doc.title,
        type: 'document',
        size: formatFileSize(currentVersion?.file_size),
        creator: doc.created_by || '-',
        time: currentVersion?.effective_at || '-',
        status: doc.status === 'Obsolete' ? 'Obsolete' : (currentVersion?.status || 'Effective'),
        version: currentVersion?.ver_number || (currentVersion?.seq ? `第 ${currentVersion.seq} 版` : '-'),
        revision_date: currentVersion?.revision_date || '-',
        effective_at: currentVersion?.effective_at,
        obsolete_at: currentVersion?.effective_until || null,
        versions: doc.versions,
        mime: currentVersion?.mime,
        ver_id: currentVersion?.ver_id,
        file_name: currentVersion?.file_name,
        can_manage: !!doc.can_manage,
        is_pdf: !!doc.is_pdf || currentVersion?.ext?.toLowerCase() === '.pdf',
        can_preview: !!doc.can_preview || ['.pdf', '.html', '.htm', '.mhtml'].includes(currentVersion?.ext?.toLowerCase() || '')
      });
    });

    // 搜尋篩選 (不分大小寫)
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(q) || item.code?.toLowerCase().includes(q));
    }

    return list;
  }, [folders, currentFolderId, searchQuery, isFolderManager, documentsHook.documents]);

  const breadcrumbs = getBreadcrumbs();

  const openDocument = (item: DMSItem) => {
    const doc = documentsById.get(item.id.toString()) || null;
    setActiveDoc(doc);
    return doc;
  };

  const handlePreviewDocument = async (item: DMSItem) => {
    if (!item.ver_id) return;
    try {
      await DocumentsAPI.previewVersion(
        item.ver_id,
        item.code,
        `${user.name || ''} ${user.id || ''}`.trim(),
        item.name,
        item.revision_date
      );
    } catch (err: unknown) {
      showToast('預覽文件失敗：' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  const handleDownloadDocument = async (item: DMSItem) => {
    if (!item.ver_id) return;
    try {
      await DocumentsAPI.downloadVersion(item.ver_id, item.file_name || item.name);
    } catch (err: unknown) {
      showToast('下載文件失敗：' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  return (
    <div id="app-container">
      {/* 側邊欄 */}
      <Sidebar
        user={user}
        folders={folders}
        currentFolderId={currentFolderId}
        onSelectFolder={(id) => {
          setSearchQuery('');
          setCurrentFolderId(id);
        }}
        expandedFolders={expandedFolders}
        onToggleExpand={handleToggleExpand}
        onLogout={onLogout}
      />

      {/* 主內容區 */}
      <main className="main-content">
        <header className="top-header">
          <div className="header-left">
            <nav className="breadcrumbs">
              <span
                className={`breadcrumb-item ${currentFolderId === '' ? 'active' : ''}`}
                onClick={() => currentFolderId !== '' && setCurrentFolderId('')}
              >
                文件庫
              </span>
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  <span className="breadcrumb-separator"> / </span>
                  <span
                    className={`breadcrumb-item ${idx === breadcrumbs.length - 1 ? 'active' : ''}`}
                    onClick={() => idx !== breadcrumbs.length - 1 && setCurrentFolderId(crumb.id)}
                  >
                    {crumb.name}
                  </span>
                </React.Fragment>
              ))}
            </nav>
          </div>
          <div className="header-right">
            <div className="search-box">
              <SearchIcon size={16} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="搜尋資料夾或文件..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </header>

        <div className="action-bar">
          <div className="action-left">
            <h2>{getCurrentTitle()}</h2>
            <span className="badge">{combinedItems.length} 個項目</span>
            <span className="badge" style={{ marginLeft: '8px', backgroundColor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)' }}>
              管理員：{currentFolderId === '' ? '系統管理員' : (folders.find(f => f.id === currentFolderId)?.manager_names || '系統管理員')}
            </span>
          </div>
          <div className="action-right">
            {canCreateFolder && (
              <button className="btn btn-secondary" onClick={() => setIsNewFolderOpen(true)}>
                <CreateNewFolderIcon size={18} />
                <span>新建資料夾</span>
              </button>
            )}
            {canCreateDocument && (
              <button className="btn btn-primary" onClick={() => setIsNewDocOpen(true)}>
                <CloudUploadIcon size={18} />
                <span>新建文件</span>
              </button>
            )}
          </div>
        </div>

        <div className="table-container">
          {isContentLoading && (
            <div className="content-loading-indicator" role="status" aria-live="polite">
              <span className="sr-only">資料載入中</span>
            </div>
          )}

          {!isContentLoading && (
            combinedItems.length === 0 && currentFolderId === '' ? (
              <div className="empty-state fade-in">
                <div className="empty-icon">
                  <CreateNewFolderIcon size={48} />
                </div>
                <h3>目前尚無任何第一層資料夾</h3>
                <p>{isAdmin ? '您是系統管理員，請建立第一層資料夾以啟動系統。' : '系統中尚無資料，請聯繫系統管理員建立第一層資料夾。'}</p>
              </div>
            ) : (
              <FileTable
                items={combinedItems}
                onEnterFolder={(id) => {
                  setCurrentFolderId(id);
                  setSearchQuery('');
                }}
                onRename={(id, name) => {
                  setRenameId(id);
                  setRenameValue(name);
                  setIsRenameOpen(true);
                }}
                onArchiveFolder={(id, name) => {
                  setActiveItem({ id, name });
                  setIsArchiveFolderOpen(true);
                }}
                onDeleteFolder={(id, name) => {
                  setActiveItem({ id, name });
                  setIsDeleteFolderOpen(true);
                }}
                onSetAcl={(id, name) => {
                  setAclFolder({ id, name });
                  setIsFolderAclOpen(true);
                }}
                onPreviewDocument={handlePreviewDocument}
                onDownloadDocument={handleDownloadDocument}
                onUploadVersion={(item) => {
                  const doc = openDocument(item);
                  if (doc) setIsUploadVerOpen(true);
                }}
                onCancelVersion={(item) => {
                  const doc = openDocument(item);
                  if (doc) setIsCancelVersionOpen(true);
                }}
                onObsoleteDocument={(item) => {
                  const doc = openDocument(item);
                  if (doc) setIsObsoleteDocOpen(true);
                }}
                onDeleteDocument={(item) => {
                  const doc = openDocument(item);
                  if (doc) setIsDeleteDocOpen(true);
                }}
                onShowHistory={(item) => {
                  const doc = openDocument(item);
                  if (doc) setIsHistoryOpen(true);
                }}
              />
            )
          )}
        </div>
      </main>

      {/* --- Modals 組件調用群組 --- */}

      {/* Folder Modals */}
      <NewFolderModal
        isOpen={isNewFolderOpen}
        onClose={() => setIsNewFolderOpen(false)}
        onCreate={handleCreateFolder}
        isRoot={!currentFolderId}
        userRole={user.role}
      />

      <RenameModal
        isOpen={isRenameOpen}
        onClose={() => setIsRenameOpen(false)}
        initialValue={renameValue}
        isRoot={folders.find(f => f.id === renameId)?.parent_id === null}
        initialManagers={folders.find(f => f.id === renameId)?.managers}
        userRole={user.role}
        onRename={async (newName, managers) => {
          return await handleRenameFolder(renameId, newName, managers);
        }}
      />

      <ArchiveFolderModal
        isOpen={isArchiveFolderOpen}
        onClose={() => setIsArchiveFolderOpen(false)}
        targetName={activeItem?.name || ''}
        onArchive={async () => {
          if (activeItem) {
            return await handleArchiveFolder(activeItem.id, activeItem.name);
          }
          return false;
        }}
      />

      {aclFolder && (
        <FolderAclModal
          isOpen={isFolderAclOpen}
          onClose={() => setIsFolderAclOpen(false)}
          folderId={aclFolder.id}
          folderName={aclFolder.name}
          onSaved={async () => {
            await fetchFolders();
          }}
        />
      )}

      <NewDocModal
        isOpen={isNewDocOpen}
        onClose={() => setIsNewDocOpen(false)}
        onCreate={async (...args) => {
          const success = await documentsHook.handleCreateDocument(...args);
          if (success) {
            await fetchFolders();
          }
          return success;
        }}
      />

      <UploadVerModal
        isOpen={isUploadVerOpen}
        onClose={() => setIsUploadVerOpen(false)}
        targetDoc={activeDoc}
        onUpload={documentsHook.handleUploadVersion}
      />

      <ObsoleteDocModal
        isOpen={isObsoleteDocOpen}
        onClose={() => setIsObsoleteDocOpen(false)}
        targetName={activeDoc?.title || ''}
        onObsolete={async (reason, file) => {
          if (!activeDoc) return false;
          const success = await documentsHook.handleObsoleteDocument(activeDoc.id, activeDoc.title, reason, file);
          if (success) {
            await fetchFolders();
          }
          return success;
        }}
      />

      <DeleteDocModal
        isOpen={isDeleteDocOpen}
        onClose={() => setIsDeleteDocOpen(false)}
        targetName={activeDoc?.title || ''}
        onDelete={async () => {
          if (!activeDoc) return false;
          const success = await documentsHook.handleDeleteDocument(activeDoc.id, activeDoc.title);
          if (success) {
            await fetchFolders();
          }
          return success;
        }}
      />

      <DeleteFolderModal
        isOpen={isDeleteFolderOpen}
        onClose={() => setIsDeleteFolderOpen(false)}
        targetName={activeItem?.name || ''}
        onDelete={async () => {
          if (activeItem) {
            return await handleDeleteFolder(activeItem.id, activeItem.name);
          }
          return false;
        }}
      />

      <CancelVersionModal
        isOpen={isCancelVersionOpen}
        onClose={() => setIsCancelVersionOpen(false)}
        targetName={activeDoc?.title || ''}
        onCancelVersion={async (reason) => {
          if (!activeDoc) return false;
          return await documentsHook.handleCancelLatestVersion(activeDoc.id, reason);
        }}
      />

      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        historyDoc={activeDoc}
        handleDownload={async (verId, fileName) => {
          try {
            await DocumentsAPI.downloadVersion(verId, fileName || activeDoc?.title || 'document');
          } catch (err: unknown) {
            showToast('下載版本檔案失敗：' + (err instanceof Error ? err.message : String(err)), 'error');
          }
        }}
      />

      {/* Feedback Modals */}
      <ErrorDetailModal
        isOpen={errorDetail !== null}
        onClose={handleCloseErrorModal}
        title={errorDetail?.title || '系統錯誤'}
        message={errorDetail?.message || ''}
      />

      <TestResultModal
        isOpen={testResult !== null}
        onClose={() => setTestResult(null)}
        result={testResult}
      />
    </div>
  );
};
