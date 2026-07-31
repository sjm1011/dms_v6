import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, DocumentSecurityLevel, User } from '../types';
import { DocumentsAPI } from '../api/documents';

export const useDocuments = (
  user: User | null,
  currentFolderId: string,
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
  enabled = true
) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const requestSeqRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);

  const incrementVersionAccessCount = useCallback((versionId: string) => {
    setDocuments((currentDocuments) => currentDocuments.map((document) => {
      let changed = false;
      const versions = document.versions.map((version) => {
        if (version.ver_id !== versionId) {
          return version;
        }

        changed = true;
        return {
          ...version,
          access_count: version.access_count + 1
        };
      });

      return changed ? { ...document, versions } : document;
    }));
  }, []);

  // 載入文件清單
  const fetchDocuments = async (background = false) => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    requestAbortRef.current?.abort();

    if (!enabled || !user) {
      requestAbortRef.current = null;
      setDocuments([]);
      setIsLoadingDocuments(false);
      return;
    }

    const controller = new AbortController();
    requestAbortRef.current = controller;
    if (!background) {
      setDocuments([]);
      setIsLoadingDocuments(true);
    }

    try {
      const res = await DocumentsAPI.getDocuments(currentFolderId || '0', controller.signal);
      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      if (res.success) {
        setDocuments(res.data);
      } else {
        showToast(res.error, 'error');
      }
    } catch (err: unknown) {
      if (requestSeq !== requestSeqRef.current || (err instanceof DOMException && err.name === 'AbortError')) {
        return;
      }

      const msg = err instanceof Error ? err.message : String(err);
      showToast('載入文件清單失敗：' + msg, 'error');
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setIsLoadingDocuments(false);
        if (requestAbortRef.current === controller) {
          requestAbortRef.current = null;
        }
      }
    }
  };

  // 當前目錄或資料夾更新時，載入該層文件
  useEffect(() => {
    if (user && enabled) {
      void fetchDocuments();
    } else {
      requestSeqRef.current += 1;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      setDocuments([]);
      setIsLoadingDocuments(false);
    }

    return () => {
      requestSeqRef.current += 1;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
    };
  }, [currentFolderId, user, enabled]);

  // 新增文件與上傳第一版
  const handleCreateDocument = async (
    code: string,
    title: string,
    version: string,
    changeNote: string,
    revisionDate: string,
    effAt: string,
    file: File,
    sourceFile?: File | null,
    securityLevel?: DocumentSecurityLevel,
    parentDocumentId?: string | null
  ) => {
    showToast(parentDocumentId ? '正在建立相關文件與上傳檔案...' : '正在建立文件與上傳檔案...', 'info');
    try {
      const res = await DocumentsAPI.createDocument(
        currentFolderId || '0',
        code,
        title,
        version,
        changeNote,
        revisionDate,
        effAt,
        file,
        sourceFile,
        securityLevel,
        parentDocumentId
      );
      if (res.success) {
        showToast(`${parentDocumentId ? '相關文件' : '文件'}「${title}」建立並上傳成功。`, 'success');
        void fetchDocuments(true);
        return true;
      } else {
        showToast(res.error, 'error');
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('建立文件失敗：' + msg, 'error');
      return false;
    }
  };

  // 上傳新版本 (版更)
  const handleUploadVersion = async (
    docId: string,
    version: string,
    changeNote: string,
    revisionDate: string,
    effAt: string,
    file: File,
    sourceFile?: File | null
  ) => {
    showToast('正在上傳新版本檔案...', 'info');
    try {
      const res = await DocumentsAPI.uploadVersion(
        docId,
        version,
        changeNote,
        revisionDate,
        effAt,
        file,
        sourceFile
      );
      if (res.success) {
        showToast(`新版本 ${version || ''} 已建立，系統會依生效日期切換版本。`, 'success');
        void fetchDocuments(true);
        return true;
      } else {
        showToast(res.error, 'error');
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('版更上傳失敗：' + msg, 'error');
      return false;
    }
  };

  // 撤回最新版本並回復前版
  const handleCancelLatestVersion = async (docId: string, reason: string) => {
    try {
      const res = await DocumentsAPI.cancelLatestVersion(docId, reason);
      if (res.success) {
        showToast('最新版本已撤回，前一版已回復為延續版本。', 'success');
        void fetchDocuments(true);
        return true;
      } else {
        showToast(res.error, 'error');
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('撤回版本失敗：' + msg, 'error');
      return false;
    }
  };

  const handleEditDocument = async (
    docId: string,
    versionId: string,
    code: string,
    title: string,
    version: string,
    changeNote: string,
    revisionDate: string,
    effAt: string,
    sourceFile?: File | null,
    securityLevel?: DocumentSecurityLevel
  ) => {
    try {
      const res = await DocumentsAPI.editDocument(
        docId,
        versionId,
        code,
        title,
        version,
        changeNote,
        revisionDate,
        effAt,
        sourceFile,
        securityLevel
      );
      if (res.success) {
        showToast(`文件「${title}」已更新。`, 'success');
        void fetchDocuments(true);
        return true;
      }
      showToast(res.error, 'error');
      return false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('修改文件失敗：' + msg, 'error');
      return false;
    }
  };

  const handleMoveDocument = async (
    docId: string,
    documentName: string,
    destinationFolderId: string,
    destinationFolderName: string
  ) => {
    try {
      const res = await DocumentsAPI.moveDocument(docId, destinationFolderId);
      if (res.success) {
        showToast(
          `文件「${documentName}」共 ${res.data.moved_document_count} 份已移至「${destinationFolderName}」。`,
          'success'
        );
        void fetchDocuments(true);
        return res.data;
      }
      showToast(res.error, 'error');
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('移動文件失敗：' + msg, 'error');
      return null;
    }
  };

  // 廢止文件
  const handleObsoleteDocument = async (docId: string, docName: string, reason: string, file: File) => {
    try {
      const res = await DocumentsAPI.obsoleteDocument(docId, reason, file);
      if (res.success) {
        showToast(`文件「${docName}」已成功設為廢止狀態，公文已存檔。`, 'success');
        void fetchDocuments(true);
        return true;
      } else {
        showToast(res.error, 'error');
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('廢止文件失敗：' + msg, 'error');
      return false;
    }
  };

  // 刪除第一版文件
  const handleDeleteDocument = async (docId: string, docName: string) => {
    try {
      const res = await DocumentsAPI.deleteDocument(docId);
      if (res.success) {
        showToast(`文件「${docName}」已刪除，稽核紀錄已保存。`, 'success');
        void fetchDocuments(true);
        return true;
      } else {
        showToast(res.error, 'error');
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('刪除文件失敗：' + msg, 'error');
      return false;
    }
  };

  const handleDeleteScheduledVersion = async (
    docId: string,
    versionId: string,
    docName: string
  ) => {
    try {
      const res = await DocumentsAPI.deleteScheduledVersion(docId, versionId);
      if (res.success) {
        showToast(`文件「${docName}」的預約版本已刪除。`, 'success');
        void fetchDocuments(true);
        return true;
      }
      showToast(res.error, 'error');
      return false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('刪除預約版本失敗：' + msg, 'error');
      return false;
    }
  };

  return {
    documents,
    setDocuments,
    isLoadingDocuments,
    fetchDocuments,
    incrementVersionAccessCount,
    handleCreateDocument,
    handleUploadVersion,
    handleEditDocument,
    handleMoveDocument,
    handleCancelLatestVersion,
    handleDeleteScheduledVersion,
    handleObsoleteDocument,
    handleDeleteDocument
  };
};
