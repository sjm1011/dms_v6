import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { User, Folder, DMSItem, Document, DocumentVersion, FolderManagerAssignmentType, SystemPage } from '../types';
import { Sidebar } from '../components/Sidebar';
import { FileTable } from '../components/FileTable';
import { useDocuments } from '../hooks/useDocuments';
import { DocumentsAPI } from '../api/documents';
import { FoldersAPI } from '../api/folders';
import {
  SearchIcon,
  CreateNewFolderIcon,
  CloudUploadIcon,
  CheckCircleIcon,
  ErrorOutlineIcon
} from '../components/Icons';

// 匯入分流後的 Modals 
import { NewFolderModal, RenameModal, ArchiveFolderModal, DeleteFolderModal } from '../components/Modals/FolderModals';
import { ErrorDetailModal, TestResultModal } from '../components/Modals/FeedbackModals';
import { FolderAclModal } from '../components/Modals/FolderAclModal';
import { FolderManagerModal } from '../components/Modals/FolderManagerModal';
import { SystemManagement } from '../components/SystemManagement';
import { ACCEPTED_DOCUMENT_FILE_TYPES, DeleteScheduledVersionModal, EditDocumentModal, NewDocModal, UploadVerModal, ObsoleteDocModal, DeleteDocModal, CancelVersionModal, HistoryModal } from '../components/Modals/DocumentModals';

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
  const [activeSystemPage, setActiveSystemPage] = useState<SystemPage | null>(null);

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isEditManagersOpen, setIsEditManagersOpen] = useState(false);
  const [renameId, setRenameId] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [editManagerIds, setEditManagerIds] = useState<string[]>([]);
  const [managerAssignmentType, setManagerAssignmentType] = useState<FolderManagerAssignmentType>('CO_MANAGER');
  const [currentManagerNames, setCurrentManagerNames] = useState<string[]>([]);
  const [currentCoManagerNames, setCurrentCoManagerNames] = useState<string[]>([]);
  const [loadedManagerFolderId, setLoadedManagerFolderId] = useState<string | null>(null);

  const [isArchiveFolderOpen, setIsArchiveFolderOpen] = useState(false);
  const [isDeleteFolderOpen, setIsDeleteFolderOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<{ id: string; name: string } | null>(null);

  const [isFolderAclOpen, setIsFolderAclOpen] = useState(false);
  const [aclFolder, setAclFolder] = useState<{ id: string; name: string } | null>(null);

  const [isNewDocOpen, setIsNewDocOpen] = useState(false);
  const [isUploadVerOpen, setIsUploadVerOpen] = useState(false);
  const [isEditDocumentOpen, setIsEditDocumentOpen] = useState(false);
  const [isDeleteScheduledVersionOpen, setIsDeleteScheduledVersionOpen] = useState(false);
  const [isObsoleteDocOpen, setIsObsoleteDocOpen] = useState(false);
  const [isDeleteDocOpen, setIsDeleteDocOpen] = useState(false);
  const [isCancelVersionOpen, setIsCancelVersionOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [uploadVerFile, setUploadVerFile] = useState<File | null>(null);
  const newDocFileInputRef = useRef<HTMLInputElement>(null);
  const uploadVerFileInputRef = useRef<HTMLInputElement>(null);

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
  const documentsHook = useDocuments(user, currentFolderId, showToast, canLoadCurrentFolderDocuments && activeSystemPage === null);
  const isContentLoading = activeSystemPage === null && (!hasLoadedFolders || isLoadingFolders || documentsHook.isLoadingDocuments);

  // 管理權限由後端計算，前端只使用能力旗標，不接收管理員員工編號。
  const isFolderManager = useCallback((targetFolderId: string | null | undefined) => {
    if (user.role === 'ADMIN') return true;
    if (!targetFolderId) return false;
    return Boolean(foldersById.get(targetFolderId.toString())?.can_manage);
  }, [user.role, foldersById]);

  const isCurrentFolderManager = useCallback(() => isFolderManager(currentFolderId), [isFolderManager, currentFolderId]);

  useEffect(() => {
    setCurrentManagerNames([]);
    setCurrentCoManagerNames([]);
    setLoadedManagerFolderId(null);

    if (!currentFolderId || !isFolderManager(currentFolderId)) {
      return;
    }

    const controller = new AbortController();
    const loadManagerNames = async () => {
      try {
        const res = await FoldersAPI.getFolderManagers(currentFolderId, false, controller.signal);
        if (res.success) {
          setCurrentManagerNames(res.data.names || []);
          setCurrentCoManagerNames(res.data.co_manager_names || []);
          setLoadedManagerFolderId(currentFolderId);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setCurrentManagerNames([]);
          setCurrentCoManagerNames([]);
          setLoadedManagerFolderId(currentFolderId);
        }
      }
    };

    void loadManagerNames();
    return () => {
      controller.abort();
      setCurrentManagerNames([]);
      setCurrentCoManagerNames([]);
      setLoadedManagerFolderId(null);
    };
  }, [currentFolderId, isFolderManager]);

  const loadManagerEditorIds = async (folderId: string, assignmentType: FolderManagerAssignmentType) => {
    try {
      const res = await FoldersAPI.getFolderManagers(folderId, true, undefined, assignmentType);
      if (!res.success) {
        showToast(res.error, 'error');
        return null;
      }

      if (folderId === currentFolderId) {
        setCurrentManagerNames(res.data.names || []);
        setCurrentCoManagerNames(res.data.co_manager_names || []);
        setLoadedManagerFolderId(folderId);
      }
      return res.data.employee_ids || [];
    } catch (error) {
      showToast('載入資料夾管理員設定失敗：' + (error instanceof Error ? error.message : String(error)), 'error');
      return null;
    }
  };

  const refreshCurrentManagerNames = async (folderId: string) => {
    if (folderId !== currentFolderId || !isFolderManager(folderId)) {
      return;
    }

    const res = await FoldersAPI.getFolderManagers(folderId);
    if (res.success) {
      setCurrentManagerNames(res.data.names || []);
      setCurrentCoManagerNames(res.data.co_manager_names || []);
      setLoadedManagerFolderId(folderId);
    }
  };

  // 根目錄下只有系統管理員可以新增第一層資料夾；子目錄下只有區段管理員可以新增子目錄
  const canCreateFolder = currentFolderIsActive && (currentFolderId === '' ? isAdmin : isCurrentFolderManager());
  const canCreateDocument = currentFolderIsActive && (currentFolderId === '' ? isAdmin : isCurrentFolderManager());
  const hasLoadedCurrentManagerNames = loadedManagerFolderId === currentFolderId;
  const currentFolderHasDetailedAcl = Boolean(currentFolder?.acl_summary?.trim());

  const renderCurrentFolderAccessBadge = () => {
    if (!currentFolder) return null;

    const isRestricted = currentFolder.access_type === 2;
    const isInherited = Boolean(currentFolder.is_access_inherited);
    const title = isRestricted
      ? isInherited
        ? `授權對象：${currentFolder.acl_summary || '未設定詳細授權'}`
        : currentFolderHasDetailedAcl
          ? `限閱，已授權：${currentFolder.acl_summary}`
          : '限閱，未設定詳細授權'
      : '公開，任何登入同仁皆可見並可進入';
    const className = `badge-access folder-header-access-badge ${isRestricted ? 'restricted' : 'public'}${isInherited ? ' inherited' : ''}`;
    const content = (
      <>
        <span>{isRestricted ? '限閱' : '公開'}</span>
        {isRestricted && (currentFolderHasDetailedAcl
          ? <CheckCircleIcon size={16} aria-hidden="true" />
          : <ErrorOutlineIcon size={16} aria-hidden="true" />)}
      </>
    );

    if (isInherited || !isCurrentFolderManager()) {
      return <span className={className} title={title}>{content}</span>;
    }

    return (
      <button
        type="button"
        className={`${className} editable`}
        title={`${title}；點擊開啟資料夾屬性`}
        aria-label={`${title}；點擊開啟資料夾屬性`}
        onClick={() => {
          setAclFolder({ id: currentFolder.id, name: currentFolder.name });
          setIsFolderAclOpen(true);
        }}
      >
        {content}
      </button>
    );
  };

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
        access_type: f.access_type,
        acl_summary: f.acl_summary,
        is_access_inherited: Boolean(f.is_access_inherited),
        child_folder_count: childFolderCount,
        document_count: documentCount,
        is_empty_folder: childFolderCount === 0 && documentCount === 0,
        can_manage: Boolean(f.can_manage) && f.status === 1,
        manager_role: f.manager_role || null
      });
    });

    documentsHook.documents.forEach(doc => {
      const scheduledVersion = doc.can_manage
        ? doc.versions?.find(v => v.status === 'Scheduled')
        : undefined;
      const effectiveVersion = doc.versions?.find(v => v.status === 'Effective');
      const displayVersions = scheduledVersion
        ? [scheduledVersion, effectiveVersion].filter(
            (version): version is DocumentVersion => Boolean(version)
          )
        : [effectiveVersion || doc.versions?.[0]].filter(
            (version): version is DocumentVersion => Boolean(version)
          );

      displayVersions.forEach(displayVersion => {
        const currentExtension = displayVersion.ext?.replace(/^\./, '').toLowerCase();
        list.push({
          id: doc.id,
          code: doc.code,
          name: doc.title,
          type: 'document',
          size: formatFileSize(displayVersion.file_size),
          creator: doc.created_by || '-',
          time: displayVersion.effective_at || '-',
          status: doc.status === 'Obsolete' ? 'Obsolete' : displayVersion.status,
          version: displayVersion.ver_number || (displayVersion.seq ? `第 ${displayVersion.seq} 版` : '-'),
          revision_date: displayVersion.revision_date || '-',
          effective_at: displayVersion.effective_at,
          obsolete_at: displayVersion.effective_until || null,
          versions: doc.versions,
          mime: displayVersion.mime,
          ver_id: displayVersion.ver_id,
          file_name: displayVersion.file_name,
          can_manage: !!doc.can_manage,
          manager_role: currentFolder?.manager_role || null,
          is_pdf: currentExtension ? currentExtension === 'pdf' : false,
          can_preview: currentExtension
            ? ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(currentExtension)
            : false,
          has_source_file: !!displayVersion.has_source_file,
          has_scheduled_version: Boolean(scheduledVersion)
        });
      });
    });

    // 搜尋篩選 (不分大小寫)
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(q) || item.code?.toLowerCase().includes(q));
    }

    return list;
  }, [folders, currentFolder, currentFolderId, searchQuery, documentsHook.documents]);

  const breadcrumbs = getBreadcrumbs();

  const openDocument = (item: DMSItem) => {
    const doc = documentsById.get(item.id.toString()) || null;
    const selectedVersion = doc?.versions.find(version => version.ver_id === item.ver_id);
    const selectedDoc = doc && selectedVersion
      ? {
          ...doc,
          ver_id: selectedVersion.ver_id,
          version: selectedVersion.ver_number,
          file_size: selectedVersion.file_size,
          mime: selectedVersion.mime,
          change_note: selectedVersion.change_note,
          revision_date: selectedVersion.revision_date,
          effective_at: selectedVersion.effective_at,
          obsolete_at: selectedVersion.effective_until || null,
          is_pdf: selectedVersion.ext?.replace(/^\./, '').toLowerCase() === 'pdf',
          can_preview: ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(
            selectedVersion.ext?.replace(/^\./, '').toLowerCase() || ''
          ),
          has_source_file: Boolean(selectedVersion.has_source_file)
        }
      : doc;
    setActiveDoc(selectedDoc);
    return selectedDoc;
  };

  const handlePreviewDocument = async (item: DMSItem) => {
    if (!item.ver_id) return;
    try {
      await DocumentsAPI.previewVersion(
        item.ver_id,
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
      <input
        ref={newDocFileInputRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_FILE_TYPES}
        style={{ display: 'none' }}
        onChange={(event) => {
          const selectedFile = event.target.files?.[0] || null;
          event.target.value = '';
          if (!selectedFile) return;
          setNewDocFile(selectedFile);
          setIsNewDocOpen(true);
        }}
      />
      <input
        ref={uploadVerFileInputRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_FILE_TYPES}
        style={{ display: 'none' }}
        onChange={(event) => {
          const selectedFile = event.target.files?.[0] || null;
          event.target.value = '';
          if (!selectedFile) return;
          setUploadVerFile(selectedFile);
          setIsUploadVerOpen(true);
        }}
      />
      {/* 側邊欄 */}
      <Sidebar
        user={user}
        folders={folders}
        currentFolderId={currentFolderId}
        onSelectFolder={(id) => {
          setActiveSystemPage(null);
          setSearchQuery('');
          setCurrentFolderId(id);
        }}
        expandedFolders={expandedFolders}
        onToggleExpand={handleToggleExpand}
        activeSystemPage={activeSystemPage}
        onSelectSystemPage={setActiveSystemPage}
        onLogout={onLogout}
      />

      {/* 主內容區 */}
      <main className="main-content">
        {activeSystemPage ? (
          <SystemManagement
            page={activeSystemPage}
            currentUserId={user.id}
            showToast={showToast}
            refreshFolders={fetchFolders}
            onOpenFolder={(folderId) => {
              setCurrentFolderId(folderId);
              setSearchQuery('');
              setActiveSystemPage(null);
            }}
          />
        ) : (
          <>
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
            {renderCurrentFolderAccessBadge()}
            <span className="badge">{combinedItems.length} 個項目</span>
            {currentFolderId !== '' && isCurrentFolderManager() && hasLoadedCurrentManagerNames && (
              <button
                type="button"
                className="badge manager-assignment-badge"
                disabled={!currentFolder?.can_edit_primary_manager}
                style={{
                  marginLeft: 0,
                  backgroundColor: currentManagerNames.length > 0 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(239, 68, 68, 0.12)',
                  borderColor: currentManagerNames.length > 0 ? 'var(--glass-border)' : '#ef4444',
                  color: currentManagerNames.length > 0 ? 'var(--text-secondary)' : '#ef4444',
                  cursor: currentFolder?.can_edit_primary_manager ? 'pointer' : 'default'
                }}
                onClick={() => {
                  if (!currentFolder?.can_edit_primary_manager) return;
                  void (async () => {
                    const managerIds = await loadManagerEditorIds(currentFolder.id, 'PRIMARY');
                    if (managerIds === null) return;
                    setManagerAssignmentType('PRIMARY');
                    setEditManagerIds(managerIds);
                    setIsEditManagersOpen(true);
                  })();
                }}
              >
                管理員：{currentManagerNames.length > 0 ? currentManagerNames.join('、') : '未指派'}
              </button>
            )}
            {currentFolderId !== '' && isCurrentFolderManager() && hasLoadedCurrentManagerNames && (
              <button
                type="button"
                className="badge manager-assignment-badge"
                disabled={!currentFolder?.can_assign_co_managers}
                style={{
                  marginLeft: 0,
                  backgroundColor: currentCoManagerNames.length > 0 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(239, 68, 68, 0.12)',
                  borderColor: currentCoManagerNames.length > 0 ? 'var(--glass-border)' : '#ef4444',
                  color: currentCoManagerNames.length > 0 ? 'var(--text-secondary)' : '#ef4444',
                  cursor: currentFolder?.can_assign_co_managers ? 'pointer' : 'default'
                }}
                onClick={() => {
                  if (!currentFolder?.can_assign_co_managers) return;
                  void (async () => {
                    const managerIds = await loadManagerEditorIds(currentFolder.id, 'CO_MANAGER');
                    if (managerIds === null) return;
                    setManagerAssignmentType('CO_MANAGER');
                    setEditManagerIds(managerIds);
                    setIsEditManagersOpen(true);
                  })();
                }}
              >
                協同管理員：{currentCoManagerNames.length > 0 ? currentCoManagerNames.join('、') : '未指派'}
              </button>
            )}
          </div>
          <div className="action-right">
            {canCreateFolder && (
              <button className="btn btn-secondary" onClick={() => setIsNewFolderOpen(true)}>
                <CreateNewFolderIcon size={18} />
                <span>新建資料夾</span>
              </button>
            )}
            {canCreateDocument && (
              <button className="btn btn-primary" onClick={() => newDocFileInputRef.current?.click()}>
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
                  if (doc) uploadVerFileInputRef.current?.click();
                }}
                onEditDocument={(item) => {
                  const doc = openDocument(item);
                  if (doc) setIsEditDocumentOpen(true);
                }}
                onDeleteScheduledVersion={(item) => {
                  const doc = openDocument(item);
                  if (doc) setIsDeleteScheduledVersionOpen(true);
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
          </>
        )}
      </main>

      {/* --- Modals 組件調用群組 --- */}

      {/* Folder Modals */}
      <NewFolderModal
        isOpen={isNewFolderOpen}
        onClose={() => setIsNewFolderOpen(false)}
        onCreate={handleCreateFolder}
        isRoot={!currentFolderId}
        userRole={user.role}
        lookupFolderId={currentFolderId || undefined}
      />

      <RenameModal
        isOpen={isRenameOpen}
        onClose={() => {
          setIsRenameOpen(false);
        }}
        initialValue={renameValue}
        isRoot={folders.find(f => f.id === renameId)?.parent_id === null}
        initialManagers={[]}
        userRole={user.role}
        lookupFolderId={renameId}
        onRename={async (newName) => await handleRenameFolder(renameId, newName)}
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
        initialFile={newDocFile}
        onClose={() => {
          setIsNewDocOpen(false);
          setNewDocFile(null);
        }}
        onCreate={async (...args) => {
          const success = await documentsHook.handleCreateDocument(...args);
          if (success) {
            await fetchFolders();
          }
          return success;
        }}
      />

      {currentFolder && (
        <FolderManagerModal
          isOpen={isEditManagersOpen}
          onClose={() => {
            setIsEditManagersOpen(false);
            setEditManagerIds([]);
          }}
          initialManagers={editManagerIds}
          folderId={currentFolder.id}
          assignmentType={managerAssignmentType}
          onSave={async (managers) => {
            try {
              const response = await FoldersAPI.updateFolderManagers(
                currentFolder.id,
                managerAssignmentType,
                managers
              );
              if (!response.success) {
                showToast(response.error, 'error');
                return false;
              }
              showToast(
                managerAssignmentType === 'PRIMARY' ? '資料夾管理員已更新。' : '協同管理員已更新。',
                'success'
              );
              await fetchFolders();
              await refreshCurrentManagerNames(currentFolder.id);
              return true;
            } catch (error) {
              showToast('更新管理員失敗：' + (error instanceof Error ? error.message : String(error)), 'error');
              return false;
            }
          }}
        />
      )}

      <UploadVerModal
        isOpen={isUploadVerOpen}
        initialFile={uploadVerFile}
        onClose={() => {
          setIsUploadVerOpen(false);
          setUploadVerFile(null);
        }}
        targetDoc={activeDoc}
        onUpload={documentsHook.handleUploadVersion}
      />

      <EditDocumentModal
        isOpen={isEditDocumentOpen}
        onClose={() => setIsEditDocumentOpen(false)}
        targetDoc={activeDoc}
        onSave={documentsHook.handleEditDocument}
      />

      <DeleteScheduledVersionModal
        isOpen={isDeleteScheduledVersionOpen}
        onClose={() => setIsDeleteScheduledVersionOpen(false)}
        targetName={activeDoc?.title || ''}
        targetVersion={activeDoc?.version || ''}
        effectiveAt={activeDoc?.effective_at || ''}
        onDelete={async () => {
          if (!activeDoc?.ver_id) return false;
          return await documentsHook.handleDeleteScheduledVersion(
            activeDoc.id,
            activeDoc.ver_id,
            activeDoc.title
          );
        }}
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
