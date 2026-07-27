import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { User, Folder, DMSItem, Document, DocumentVersion, FolderManagerAssignmentType, SystemPage } from '../types';
import { Sidebar } from '../components/Sidebar';
import { FileTable } from '../components/FileTable';
import { useDocuments } from '../hooks/useDocuments';
import { DocumentsAPI } from '../api/documents';
import { FoldersAPI } from '../api/folders';
import { SearchAPI } from '../api/search';
import {
  SearchIcon,
  CreateNewFolderIcon,
  CloudUploadIcon,
  CheckCircleIcon,
  ErrorOutlineIcon,
  MenuIcon
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
  fetchFolders: (background?: boolean) => Promise<void>;
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
  const [isSidebarDrawer, setIsSidebarDrawer] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarOpenButtonRef = useRef<HTMLButtonElement>(null);
  const [searchScope, setSearchScope] = useState<'current' | 'all'>('current');
  const [searchDocuments, setSearchDocuments] = useState<Document[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchPage, setSearchPage] = useState(1);
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchRequestSeqRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);

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
  const [relatedParentDoc, setRelatedParentDoc] = useState<Document | null>(null);
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [uploadVerFile, setUploadVerFile] = useState<File | null>(null);
  const newDocFileInputRef = useRef<HTMLInputElement>(null);
  const relatedDocFileInputRef = useRef<HTMLInputElement>(null);
  const uploadVerFileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user.role === 'ADMIN';

  const closeSidebar = useCallback((restoreFocus = true) => {
    setIsSidebarOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => sidebarOpenButtonRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1180px)');
    const updateSidebarMode = () => {
      setIsSidebarDrawer(mediaQuery.matches);
      if (!mediaQuery.matches) {
        setIsSidebarOpen(false);
      }
    };

    updateSidebarMode();
    mediaQuery.addEventListener('change', updateSidebarMode);
    return () => mediaQuery.removeEventListener('change', updateSidebarMode);
  }, []);

  useEffect(() => {
    if (!isSidebarDrawer || !isSidebarOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSidebar();
        return;
      }

      if (event.key === 'Tab') {
        const sidebar = document.getElementById('sidebar-navigation');
        if (!sidebar) return;

        const focusableElements = Array.from(
          sidebar.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(element => element.offsetParent !== null);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (!firstElement || !lastElement) return;
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeSidebar, isSidebarDrawer, isSidebarOpen]);

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
  const isSearchMode = hasSearched && Boolean(submittedSearchQuery);
  const isContentLoading = activeSystemPage === null && (
    !hasLoadedFolders
    || isLoadingFolders
    || (!isSearchMode && documentsHook.isLoadingDocuments)
    || isSearching
  );

  const clearSearch = useCallback(() => {
    searchRequestSeqRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearchQuery('');
    setSubmittedSearchQuery('');
    setSearchDocuments([]);
    setSearchTotal(0);
    setSearchPage(1);
    setHasSearched(false);
    setIsSearching(false);
  }, [setSearchQuery]);

  const executeSearch = useCallback(async (page = 1, background = false) => {
    const keyword = searchQuery.trim();
    if (!keyword) {
      clearSearch();
      return;
    }

    const requestSeq = searchRequestSeqRef.current + 1;
    searchRequestSeqRef.current = requestSeq;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    if (!background) {
      setIsSearching(true);
    }

    try {
      const response = await SearchAPI.searchDocuments(
        keyword,
        searchScope,
        currentFolderId || '0',
        page,
        controller.signal
      );
      if (requestSeq !== searchRequestSeqRef.current) return;
      setSearchDocuments(response.data.documents || []);
      setSearchTotal(Number(response.data.total || 0));
      setSearchPage(Number(response.data.page || page));
      setSubmittedSearchQuery(keyword);
      setHasSearched(true);
    } catch (error) {
      if (requestSeq !== searchRequestSeqRef.current || (error instanceof DOMException && error.name === 'AbortError')) {
        return;
      }
      showToast('搜尋文件失敗：' + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      if (requestSeq === searchRequestSeqRef.current) {
        setIsSearching(false);
        if (searchAbortRef.current === controller) searchAbortRef.current = null;
      }
    }
  }, [clearSearch, currentFolderId, searchQuery, searchScope, showToast]);

  useEffect(() => () => {
    searchRequestSeqRef.current += 1;
    searchAbortRef.current?.abort();
  }, []);

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
    const source = isSearchMode ? searchDocuments : documentsHook.documents;
    source.forEach(doc => map.set(doc.id.toString(), doc));
    return map;
  }, [documentsHook.documents, isSearchMode, searchDocuments]);

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

  // 整合目前資料夾的直屬資料夾與文件。
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
          security_level: doc.security_level,
          parent_document_id: doc.parent_document_id || null,
          parent_code: doc.parent_code || null,
          parent_title: doc.parent_title || null,
          related_document_count: doc.related_document_count || 0,
          related_version_count: doc.related_version_count || 0,
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

    return list;
  }, [folders, currentFolder, currentFolderId, documentsHook.documents]);

  const searchItems = useMemo(() => {
    const list: DMSItem[] = [];
    searchDocuments.forEach(doc => {
      const scheduledVersion = doc.can_manage
        ? doc.versions.find(version => version.status === 'Scheduled')
        : undefined;
      const effectiveVersion = doc.versions.find(version => version.status === 'Effective');
      const displayVersions = scheduledVersion
        ? [scheduledVersion, effectiveVersion].filter(
            (version): version is DocumentVersion => Boolean(version)
          )
        : [effectiveVersion || doc.versions[0]].filter(
            (version): version is DocumentVersion => Boolean(version)
          );

      displayVersions.forEach(displayVersion => {
        const extension = displayVersion.ext?.replace(/^\./, '').toLowerCase();
        list.push({
          id: doc.id,
          code: doc.code,
          name: doc.title,
          type: 'document',
          size: formatFileSize(displayVersion.file_size),
          creator: doc.created_by || '-',
          time: displayVersion.effective_at || '-',
          status: displayVersion.status,
          version: displayVersion.ver_number || (displayVersion.seq ? `第 ${displayVersion.seq} 版` : '-'),
          revision_date: displayVersion.revision_date || '-',
          effective_at: displayVersion.effective_at,
          obsolete_at: displayVersion.effective_until || null,
          versions: doc.versions,
          mime: displayVersion.mime,
          ver_id: displayVersion.ver_id,
          file_name: displayVersion.file_name,
          folder_id: doc.folder_id,
          folder_path: doc.folder_path || doc.folder_name || '文件庫',
          security_level: doc.security_level,
          parent_document_id: doc.parent_document_id || null,
          parent_code: doc.parent_code || null,
          parent_title: doc.parent_title || null,
          related_document_count: doc.related_document_count || 0,
          related_version_count: doc.related_version_count || 0,
          can_manage: Boolean(doc.can_manage),
          manager_role: doc.manager_role || null,
          is_pdf: extension === 'pdf',
          can_preview: extension
            ? ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)
            : false,
          has_source_file: Boolean(displayVersion.has_source_file),
          has_scheduled_version: Boolean(scheduledVersion)
        });
      });
    });
    return list;
  }, [searchDocuments]);

  const displayedItems = isSearchMode ? searchItems : combinedItems;

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
        ref={relatedDocFileInputRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_FILE_TYPES}
        style={{ display: 'none' }}
        onChange={(event) => {
          const selectedFile = event.target.files?.[0] || null;
          event.target.value = '';
          if (!selectedFile || !relatedParentDoc) return;
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
          clearSearch();
          setCurrentFolderId(id);
          if (isSidebarDrawer) closeSidebar();
        }}
        expandedFolders={expandedFolders}
        onToggleExpand={handleToggleExpand}
        activeSystemPage={activeSystemPage}
        onSelectSystemPage={(page) => {
          clearSearch();
          setActiveSystemPage(page);
          if (isSidebarDrawer) closeSidebar();
        }}
        onLogout={onLogout}
        isDrawerMode={isSidebarDrawer}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
      />
      {isSidebarDrawer && (
        <button
          type="button"
          className={`sidebar-backdrop ${isSidebarOpen ? 'is-visible' : ''}`}
          aria-label="關閉功能選單"
          tabIndex={-1}
          onClick={() => closeSidebar()}
        />
      )}

      {/* 主內容區 */}
      <main className="main-content">
        {isSidebarDrawer && (
          <button
            ref={sidebarOpenButtonRef}
            type="button"
            className="sidebar-open-button"
            aria-label="開啟功能選單"
            aria-controls="sidebar-navigation"
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen(true)}
          >
            <MenuIcon size={20} aria-hidden="true" />
            <span>功能選單</span>
          </button>
        )}
        {activeSystemPage ? (
          <SystemManagement
            page={activeSystemPage}
            currentUserId={user.id}
            isSystemAdmin={isAdmin}
            showToast={showToast}
            refreshFolders={fetchFolders}
            onOpenFolder={(folderId) => {
              setCurrentFolderId(folderId);
              clearSearch();
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
                onClick={() => {
                  if (currentFolderId === '') return;
                  clearSearch();
                  setCurrentFolderId('');
                }}
              >
                文件庫
              </span>
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  <span className="breadcrumb-separator"> / </span>
                  <span
                    className={`breadcrumb-item ${idx === breadcrumbs.length - 1 ? 'active' : ''}`}
                    onClick={() => {
                      if (idx === breadcrumbs.length - 1) return;
                      clearSearch();
                      setCurrentFolderId(crumb.id);
                    }}
                  >
                    {crumb.name}
                  </span>
                </React.Fragment>
              ))}
            </nav>
          </div>
          <div className="header-right">
            <form className="document-search" onSubmit={(event) => {
              event.preventDefault();
              void executeSearch(1);
            }}>
              <select
                aria-label="搜尋範圍"
                value={searchScope}
                onChange={(event) => setSearchScope(event.target.value as 'current' | 'all')}
              >
                <option value="current">目前資料夾及子資料夾</option>
                <option value="all">所有可見資料夾</option>
              </select>
              <div className="search-box">
                <SearchIcon size={16} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  maxLength={100}
                  placeholder="搜尋文件..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-small" disabled={isSearching || !searchQuery.trim()}>
                搜尋
              </button>
              {isSearchMode && (
                <button type="button" className="btn btn-secondary btn-small" onClick={clearSearch}>
                  清除
                </button>
              )}
            </form>
          </div>
        </header>

        <div className="action-bar">
          <div className="action-left">
            <h2>{isSearchMode ? `搜尋結果：「${submittedSearchQuery}」` : getCurrentTitle()}</h2>
            {!isSearchMode && renderCurrentFolderAccessBadge()}
            <span className="badge">{isSearchMode ? `${searchTotal} 份文件` : `${combinedItems.length} 個項目`}</span>
            {!isSearchMode && currentFolderId !== '' && isCurrentFolderManager() && hasLoadedCurrentManagerNames && (
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
            {!isSearchMode && currentFolderId !== '' && isCurrentFolderManager() && hasLoadedCurrentManagerNames && (
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
            {!isSearchMode && canCreateFolder && (
              <button className="btn btn-secondary" onClick={() => setIsNewFolderOpen(true)}>
                <CreateNewFolderIcon size={18} />
                <span>新增資料夾</span>
              </button>
            )}
            {!isSearchMode && canCreateDocument && (
              <button className="btn btn-primary" onClick={() => {
                setRelatedParentDoc(null);
                newDocFileInputRef.current?.click();
              }}>
                <CloudUploadIcon size={18} />
                <span>新增文件</span>
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
            !isSearchMode && combinedItems.length === 0 && currentFolderId === '' ? (
              <div className="empty-state fade-in">
                <div className="empty-icon">
                  <CreateNewFolderIcon size={48} />
                </div>
                <h3>目前尚無任何第一層資料夾</h3>
                <p>{isAdmin ? '您是系統管理員，請建立第一層資料夾以啟動系統。' : '系統中尚無資料，請聯繫系統管理員建立第一層資料夾。'}</p>
              </div>
            ) : (
              <FileTable
                items={displayedItems}
                onEnterFolder={(id) => {
                  clearSearch();
                  setCurrentFolderId(id);
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
                onCreateRelatedDocument={(item) => {
                  const doc = openDocument(item);
                  if (!doc) return;
                  setRelatedParentDoc(doc);
                  relatedDocFileInputRef.current?.click();
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
                onOpenContainingFolder={isSearchMode ? (folderId) => {
                  clearSearch();
                  setCurrentFolderId(folderId === '0' ? '' : folderId);
                } : undefined}
                showFolderPath={isSearchMode}
                emptyTitle={isSearchMode ? '查無符合關鍵字的文件' : undefined}
                emptyDescription={isSearchMode ? '請更換關鍵字或搜尋範圍後再試。' : undefined}
              />
            )
          )}
          {!isContentLoading && isSearchMode && searchTotal > 0 && (
            <div className="system-pagination search-pagination">
              <span>共 {searchTotal} 份文件</span>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={searchPage <= 1 || isSearching}
                onClick={() => void executeSearch(searchPage - 1)}
              >
                上一頁
              </button>
              <span>第 {searchPage} / {Math.max(1, Math.ceil(searchTotal / 50))} 頁</span>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={searchPage >= Math.ceil(searchTotal / 50) || isSearching}
                onClick={() => void executeSearch(searchPage + 1)}
              >
                下一頁
              </button>
            </div>
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
        parentDocument={relatedParentDoc}
        allowConfidential={Boolean(currentFolderId && currentFolder?.manager_role)}
        onClose={() => {
          setIsNewDocOpen(false);
          setNewDocFile(null);
          setRelatedParentDoc(null);
        }}
        onCreate={async (...args) => {
          const success = await documentsHook.handleCreateDocument(
            ...args,
            relatedParentDoc?.id || null
          );
          if (success) {
            await fetchFolders(true);
            if (isSearchMode) {
              await executeSearch(searchPage, true);
            }
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
        onUpload={async (...args) => {
          const success = await documentsHook.handleUploadVersion(...args);
          if (success && isSearchMode) await executeSearch(searchPage, true);
          return success;
        }}
      />

      <EditDocumentModal
        isOpen={isEditDocumentOpen}
        onClose={() => setIsEditDocumentOpen(false)}
        targetDoc={activeDoc}
        canChangeSecurityLevel={Boolean(
          isSearchMode
            ? activeDoc?.folder_id === '0'
              ? user.role === 'ADMIN'
              : activeDoc?.manager_role
            : currentFolderId === ''
              ? user.role === 'ADMIN'
              : currentFolder?.manager_role
        )}
        onSave={async (...args) => {
          const success = await documentsHook.handleEditDocument(...args);
          if (success && isSearchMode) await executeSearch(searchPage, true);
          return success;
        }}
      />

      <DeleteScheduledVersionModal
        isOpen={isDeleteScheduledVersionOpen}
        onClose={() => setIsDeleteScheduledVersionOpen(false)}
        targetName={activeDoc?.title || ''}
        targetVersion={activeDoc?.version || ''}
        effectiveAt={activeDoc?.effective_at || ''}
        onDelete={async () => {
          if (!activeDoc?.ver_id) return false;
          const success = await documentsHook.handleDeleteScheduledVersion(
            activeDoc.id,
            activeDoc.ver_id,
            activeDoc.title
          );
          if (success && isSearchMode) await executeSearch(searchPage);
          return success;
        }}
      />

      <ObsoleteDocModal
        isOpen={isObsoleteDocOpen}
        onClose={() => setIsObsoleteDocOpen(false)}
        targetName={activeDoc?.title || ''}
        relatedDocumentCount={activeDoc?.related_document_count || 0}
        onObsolete={async (reason, file) => {
          if (!activeDoc) return false;
          const success = await documentsHook.handleObsoleteDocument(activeDoc.id, activeDoc.title, reason, file);
          if (success) {
            await fetchFolders();
            if (isSearchMode) await executeSearch(searchPage);
          }
          return success;
        }}
      />

      <DeleteDocModal
        isOpen={isDeleteDocOpen}
        onClose={() => setIsDeleteDocOpen(false)}
        targetName={activeDoc?.title || ''}
        relatedDocumentCount={activeDoc?.related_document_count || 0}
        totalVersionCount={
          (activeDoc?.versions.length || 0)
          + (activeDoc?.related_version_count || 0)
        }
        onDelete={async () => {
          if (!activeDoc) return false;
          const success = await documentsHook.handleDeleteDocument(activeDoc.id, activeDoc.title);
          if (success) {
            await fetchFolders();
            if (isSearchMode) await executeSearch(searchPage);
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
          const success = await documentsHook.handleCancelLatestVersion(activeDoc.id, reason);
          if (success && isSearchMode) await executeSearch(searchPage);
          return success;
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
