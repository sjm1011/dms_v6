'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useFolders } from './hooks/useFolders';
import { LoginLayout } from './layouts/LoginLayout';
import { MainLayout } from './layouts/MainLayout';
import { CheckCircleIcon, ErrorOutlineIcon, InfoIcon } from './components/Icons';
import { TooltipHost } from './components/TooltipHost';
import { AuthAPI } from './api/auth';
import type { AppTheme } from './types';

interface AppProps {
  initialLoginError?: string;
}

export const App: React.FC<AppProps> = ({ initialLoginError = '' }) => {
  const [isSavingTheme, setIsSavingTheme] = useState(false);

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
  const auth = useAuth(showToast, initialLoginError);
  const folders = useFolders(auth.user, showToast);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('external_login_error')) {
      return;
    }

    url.searchParams.delete('external_login_error');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = auth.user && auth.authenticatedTheme
      ? auth.authenticatedTheme
      : 'modern-light';
  }, [auth.authenticatedTheme, auth.user]);

  const handleAuthenticatedThemeChange = async (nextTheme: AppTheme) => {
    const previousTheme = auth.authenticatedTheme;
    if (!previousTheme || previousTheme === nextTheme || isSavingTheme) return;

    auth.setAuthenticatedTheme(nextTheme);
    setIsSavingTheme(true);
    try {
      const response = await AuthAPI.updateTheme(nextTheme);
      auth.setAuthenticatedTheme(response.data.theme);
    } catch (error) {
      auth.setAuthenticatedTheme(previousTheme);
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setIsSavingTheme(false);
    }
  };

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
      {auth.isRestoringSession ? (
        <div className="session-restoring" role="status" aria-live="polite">
          <svg className="spinner" viewBox="0 0 50 50" aria-hidden="true">
            <circle cx="25" cy="25" r="20" fill="none" strokeWidth="4"></circle>
          </svg>
          <span>正在載入系統...</span>
        </div>
      ) : !auth.user ? (
        <LoginLayout
          loginError={auth.loginError}
          isLoggingIn={auth.isLoggingIn}
          uidInputRef={auth.uidInputRef}
          onLogin={auth.handleLogin}
        />
      ) : (
        <MainLayout
          user={auth.user}
          onLogout={handleLogout}
          theme={auth.authenticatedTheme || 'soft-warm'}
          isSavingTheme={isSavingTheme}
          onThemeChange={handleAuthenticatedThemeChange}
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

      <TooltipHost />

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
