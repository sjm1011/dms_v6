import { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { AuthAPI } from '../api/auth';

export const useAuth = (
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
  initialLoginError = ''
) => {
  const [user, setUser] = useState<User | null>(null);
  const [loginError, setLoginError] = useState<string>(initialLoginError);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; data?: any; error?: string } | null>(null);
  const [isPendingLogout, setIsPendingLogout] = useState(false);

  const uidInputRef = useRef<HTMLInputElement>(null);

  // 初始化時由 Next.js HttpOnly Cookie 還原登入狀態
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const res = await AuthAPI.session();
        if (isMounted && res.success) {
          setUser(res.data);
        }
      } catch {
        if (isMounted) {
          setUser(null);
          setTestResult(null);
        }
      } finally {
        if (isMounted) {
          setIsRestoringSession(false);
        }
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // 登入時自動聚焦
  useEffect(() => {
    if (!user) {
      setTimeout(() => {
        uidInputRef.current?.focus();
      }, 50);
    }
  }, [user]);

  // 呼叫 /test 除錯 API 
  /*
  const runTestCall = async () => {
    try {
      const res = await AuthAPI.test();
      setTestResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ success: false, error: msg });
    }
  };
  */

  // 登入處理
  const handleLogin = async (uidVal: string, pwdVal: string) => {
    setLoginError('');
    setIsLoggingIn(true);
    try {
      const res = await AuthAPI.login(uidVal, pwdVal);
      if (res.success) {
        setUser(res.data);
        showToast(`歡迎回來，${res.data.name}！`, 'success');
        // 登入成功後，執行 /test API 進行驗證測試
        // runTestCall();
        return true;
      } else {
        setLoginError(res.error || '使用者帳號或密碼錯誤。');
        uidInputRef.current?.focus();
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoginError(msg);
      uidInputRef.current?.focus();
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 登出處理
  const forceLogout = async () => {
    try {
      await AuthAPI.logout();
    } catch {
      // 即使 server-side session 清除失敗，前端仍清空本地狀態。
    }
    setUser(null);
    setTestResult(null);
  };

  const handleLogout = () => {
    void forceLogout();
    showToast('您已成功登出系統。', 'info');
  };

  return {
    user,
    setUser,
    loginError,
    setLoginError,
    isRestoringSession,
    isLoggingIn,
    testResult,
    setTestResult,
    isPendingLogout,
    setIsPendingLogout,
    uidInputRef,
    handleLogin,
    handleLogout,
    forceLogout
  };
};
