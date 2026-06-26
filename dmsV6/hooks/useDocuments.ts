import { useState, useEffect, useRef } from 'react';
import { Document, User } from '../types';
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

  // 載入文件清單
  const fetchDocuments = async () => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    if (!enabled || !user) {
      setDocuments([]);
      setIsLoadingDocuments(false);
      return;
    }

    setDocuments([]);
    setIsLoadingDocuments(true);

    try {
      const res = await DocumentsAPI.getDocuments(currentFolderId || '0');
      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      if (res.success) {
        setDocuments(res.data);
      } else {
        showToast(res.error, 'error');
      }
    } catch (err: unknown) {
      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      const msg = err instanceof Error ? err.message : String(err);
      showToast('載入文件清單失敗：' + msg, 'error');
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setIsLoadingDocuments(false);
      }
    }
  };

  // 當前目錄或資料夾更新時，載入該層文件
  useEffect(() => {
    if (user && enabled) {
      fetchDocuments();
    } else {
      requestSeqRef.current += 1;
      setDocuments([]);
      setIsLoadingDocuments(false);
    }
  }, [currentFolderId, user, enabled]);

  // 新建文件與上傳第一版
  const handleCreateDocument = async (
    code: string,
    title: string,
    version: string,
    changeNote: string,
    revisionDate: string,
    effAt: string,
    file: File,
    sourceFile?: File | null
  ) => {
    showToast('正在建立文件與上傳檔案...', 'info');
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
        sourceFile
      );
      if (res.success) {
        showToast(`文件「${title}」建立並上傳成功。`, 'success');
        fetchDocuments();
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
        fetchDocuments();
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
        fetchDocuments();
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

  // 廢止文件
  const handleObsoleteDocument = async (docId: string, docName: string, reason: string, file: File) => {
    try {
      const res = await DocumentsAPI.obsoleteDocument(docId, reason, file);
      if (res.success) {
        showToast(`文件「${docName}」已成功設為廢止狀態，公文已存檔。`, 'success');
        fetchDocuments();
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
        fetchDocuments();
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

  return {
    documents,
    setDocuments,
    isLoadingDocuments,
    fetchDocuments,
    handleCreateDocument,
    handleUploadVersion,
    handleCancelLatestVersion,
    handleObsoleteDocument,
    handleDeleteDocument
  };
};
