'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useFolders } from './hooks/useFolders';
import { LoginLayout } from './layouts/LoginLayout';
import { MainLayout } from './layouts/MainLayout';
import { CheckCircleIcon, ErrorOutlineIcon, InfoIcon } from './components/Icons';

export type AppTheme = 'modern-dark' | 'modern-light';

const THEME_STORAGE_KEY = 'dms-theme';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<AppTheme>('modern-dark');
  const [themeLoaded, setThemeLoaded] = useState(false);

  // Toast 訊息狀態
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // 錯誤詳情對話框狀態（用於關鍵 API 失敗時顯示完整錯誤，手動關閉才消失）
  const [errorDetail, setErrorDetail] = useState<{ title: string; message: string } | null>(null);

  // 顯示訊息通知或錯誤彈窗的方法
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (type === 'error') {
      const isTokenError = message.includes('Token') || message.includes('憑證') || message.includes('驗證失敗') || message.includes('401');
      setErrorDetail({
        title: isTokenError ? '登入憑證失效' : '系統執行錯誤',
        message: isTokenError ? `${message}\n\n系統將於您關閉此視窗後，自動引導回登入畫面。` : message
      });
      if (isTokenError) {
        auth.setIsPendingLogout(true);
      }
    } else {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // 初始化業務邏輯 Hooks
  const auth = useAuth(showToast);
  const folders = useFolders(auth.user, showToast);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'modern-light' || savedTheme === 'light-high-contrast') {
      setTheme('modern-light');
    }
    setThemeLoaded(true);
  }, []);

  useEffect(() => {
    if (!themeLoaded) {
      return;
    }

    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, themeLoaded]);

  // 關閉錯誤對話框的處理邏輯
  const handleCloseErrorModal = () => {
    setErrorDetail(null);
    if (auth.isPendingLogout) {
      auth.setIsPendingLogout(false);
      auth.forceLogout();
      // 清空資料夾狀態
      folders.setFolders([]);
      folders.setCurrentFolderId('');
      folders.setExpandedFolders(new Set());
    }
  };

  // 處理登出邏輯並清空各模組狀態
  const handleLogout = () => {
    auth.handleLogout();
    folders.setFolders([]);
    folders.setCurrentFolderId('');
    folders.setExpandedFolders(new Set());
  };

  return (
    <>
      {!auth.user ? (
        <LoginLayout
          loginError={auth.loginError}
          isLoggingIn={auth.isLoggingIn}
          uidInputRef={auth.uidInputRef}
          onLogin={auth.handleLogin}
          theme={theme}
          onThemeChange={setTheme}
        />
      ) : (
        <MainLayout
          user={auth.user}
          onLogout={handleLogout}
          // 資料夾 Hooks 狀態與方法
          folders={folders.folders}
          isLoadingFolders={folders.isLoadingFolders}
          hasLoadedFolders={folders.hasLoadedFolders}
          currentFolderId={folders.currentFolderId}
          setCurrentFolderId={folders.setCurrentFolderId}
          expandedFolders={folders.expandedFolders}
          handleToggleExpand={folders.handleToggleExpand}
          searchQuery={folders.searchQuery}
          setSearchQuery={folders.setSearchQuery}
          handleCreateFolder={folders.handleCreateFolder}
          handleRenameFolder={folders.handleRenameFolder}
          handleArchiveFolder={folders.handleArchiveFolder}
          handleDeleteFolder={folders.handleDeleteFolder}
          fetchFolders={folders.fetchFolders}
          // 除錯與系統回報狀態
          testResult={auth.testResult}
          setTestResult={auth.setTestResult}
          errorDetail={errorDetail}
          handleCloseErrorModal={handleCloseErrorModal}
          showToast={showToast}
        />
      )}

      {/* --- Toast 訊息通知 --- */}
      {toast && (
        <div id="toast-container">
          <div className={`toast toast-${toast.type} fade-in`}>
            {toast.type === 'success' ? (
              <CheckCircleIcon className="icon" size={20} />
            ) : toast.type === 'error' ? (
              <ErrorOutlineIcon className="icon" size={20} />
            ) : (
              <InfoIcon className="icon" size={20} />
            )}
            <span className="toast-text">{toast.message}</span>
          </div>
        </div>
      )}
    </>
  );
};
