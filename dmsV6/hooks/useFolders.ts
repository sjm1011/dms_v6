import { useState, useEffect, useRef } from 'react';
import { Folder, User } from '../types';
import { FoldersAPI } from '../api/folders';

export const useFolders = (
  user: User | null, 
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
) => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [hasLoadedFolders, setHasLoadedFolders] = useState(false);
  const [currentFolderId, _setCurrentFolderId] = useState<string>('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const requestSeqRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);

  // 監聽網址 Hash 變更以支援上一頁/下一頁
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/folder/')) {
        const id = hash.replace('#/folder/', '');
        _setCurrentFolderId(id);
      } else {
        _setCurrentFolderId('');
      }
    };
    
    // 初始化時先執行一次以讀取預設 URL
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // 攔截原本的 setCurrentFolderId，改為推播 URL Hash
  const setCurrentFolderId = (id: string) => {
    if (id) {
      window.location.hash = `#/folder/${id}`;
    } else {
      window.location.hash = '#/';
    }
  };
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 載入資料夾結構
  const fetchFolders = async () => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    requestAbortRef.current?.abort();

    const controller = new AbortController();
    requestAbortRef.current = controller;
    setIsLoadingFolders(true);

    try {
      const res = await FoldersAPI.getFolders(controller.signal);
      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      if (res.success) {
        setFolders(res.data);
      } else {
        showToast(res.error, 'error');
      }
    } catch (err: unknown) {
      if (requestSeq !== requestSeqRef.current || (err instanceof DOMException && err.name === 'AbortError')) {
        return;
      }

      const msg = err instanceof Error ? err.message : String(err);
      showToast('載入資料夾結構失敗：' + msg, 'error');
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setHasLoadedFolders(true);
        setIsLoadingFolders(false);
        if (requestAbortRef.current === controller) {
          requestAbortRef.current = null;
        }
      }
    }
  };

  // 登入後自動加載資料夾
  useEffect(() => {
    if (user) {
      void fetchFolders();
    } else {
      requestSeqRef.current += 1;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      setFolders([]);
      setHasLoadedFolders(false);
      setIsLoadingFolders(false);
    }

    return () => {
      requestSeqRef.current += 1;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
    };
  }, [user]);

  // 當前目錄改變時，自動展開左側對應的樹狀目錄（僅展開所有祖先資料夾，不展開當前資料夾本身）
  useEffect(() => {
    if (currentFolderId === '') return;

    const next = new Set(expandedFolders);
    let changed = false;

    const current = folders.find(f => f.id === currentFolderId);
    if (current) {
      let parentId = current.parent_id;
      while (parentId) {
        if (!next.has(parentId)) {
          next.add(parentId);
          changed = true;
        }

        const parentFolder = folders.find(f => f.id === parentId);
        if (parentFolder) {
          parentId = parentFolder.parent_id;
        } else {
          break;
        }
      }
    }

    if (changed) {
      setExpandedFolders(next);
    }
  }, [currentFolderId, folders]);

  // 展開/摺疊資料夾樹
  const handleToggleExpand = (folderId: string) => {
    const next = new Set(expandedFolders);
    if (next.has(folderId)) {
      next.delete(folderId);
    } else {
      next.add(folderId);
    }
    setExpandedFolders(next);
  };

  // 新增資料夾
  const handleCreateFolder = async (name: string, managers?: string[]) => {
    // 同層資料夾名稱重複檢查
    const normalizedNewName = name.trim().toLowerCase();
    const isDuplicate = folders.some(f => {
      if (f.status <= 0) return false;
      const isSameParent = currentFolderId === ''
        ? (f.parent_id === null || f.parent_id === undefined)
        : (f.parent_id?.toString() === currentFolderId);
      return isSameParent && f.name.trim().toLowerCase() === normalizedNewName;
    });

    if (isDuplicate) {
      showToast(`名稱重複：同一層目錄已存在相同名稱的資料夾「${name}」。`, 'error');
      return false;
    }

    try {
      const parentId = currentFolderId ? parseInt(currentFolderId, 10) : undefined;
      const res = await FoldersAPI.createFolder(name, parentId, managers);
      if (res.success) {
        showToast(`資料夾「${name}」建立成功。`, 'success');
        fetchFolders();
        return true;
      } else {
        showToast(res.error, 'error');
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('建立資料夾失敗：' + msg, 'error');
      return false;
    }
  };

  // 重新命名資料夾
  const handleRenameFolder = async (id: string, newName: string, managers?: string[]) => {
    // 同層資料夾名稱重複檢查
    const targetFolder = folders.find(f => f.id.toString() === id.toString());
    if (targetFolder) {
      const normalizedNewName = newName.trim().toLowerCase();
      const isDuplicate = folders.some(f => {
        if (f.id.toString() === id.toString()) return false;
        if (f.status <= 0) return false;
        const isSameParent = (targetFolder.parent_id === null || targetFolder.parent_id === undefined)
          ? (f.parent_id === null || f.parent_id === undefined)
          : (f.parent_id?.toString() === targetFolder.parent_id.toString());
        return isSameParent && f.name.trim().toLowerCase() === normalizedNewName;
      });

      if (isDuplicate) {
        showToast(`名稱重複：同一層目錄已存在相同名稱的資料夾「${newName}」。`, 'error');
        return false;
      }
    }

    try {
      const res = await FoldersAPI.renameFolder(id, newName, managers);
      if (res.success) {
        showToast('重新命名成功。', 'success');
        fetchFolders();
        return true;
      } else {
        showToast(res.error, 'error');
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('操作失敗：' + msg, 'error');
      return false;
    }
  };

  // 封存資料夾
  const handleArchiveFolder = async (id: string, name: string) => {
    try {
      const res = await FoldersAPI.archiveFolder(id);
      if (res.success) {
        showToast(`資料夾「${name}」已成功封存。`, 'success');
        if (id === currentFolderId) {
          setCurrentFolderId(''); // 若封存當前資料夾，返回根目錄
        }
        fetchFolders();
        return true;
      } else {
        showToast(res.error, 'error');
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('封存資料夾失敗：' + msg, 'error');
      return false;
    }
  };

  // 刪除（作廢）空資料夾
  const handleDeleteFolder = async (id: string, name: string) => {
    try {
      const res = await FoldersAPI.deleteFolder(id);
      if (res.success) {
        showToast(`資料夾「${name}」已成功刪除（作廢）。`, 'success');
        if (id === currentFolderId) {
          setCurrentFolderId('');
        }
        fetchFolders();
        return true;
      } else {
        showToast(res.error, 'error');
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('刪除資料夾失敗：' + msg, 'error');
      return false;
    }
  };

  return {
    folders,
    setFolders,
    isLoadingFolders,
    hasLoadedFolders,
    currentFolderId,
    setCurrentFolderId,
    expandedFolders,
    setExpandedFolders,
    searchQuery,
    setSearchQuery,
    fetchFolders,
    handleToggleExpand,
    handleCreateFolder,
    handleRenameFolder,
    handleArchiveFolder,
    handleDeleteFolder
  };
};
