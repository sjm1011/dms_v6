import React, { useRef, useState } from 'react';
import {
  PersonIcon,
  LockIcon,
  ArrowForwardIcon,
  ErrorOutlineIcon
} from '../components/Icons';
import { showRequiredFieldMessage } from '../lib/clientValidation';
import { Modal } from '../components/Modal';
import { APP_VERSION_LABEL } from '../lib/appVersion';

interface LoginLayoutProps {
  loginError: string;
  isLoggingIn: boolean;
  uidInputRef: React.RefObject<HTMLInputElement | null>;
  onLogin: (uid: string, pwd: string) => Promise<boolean>;
}

export const LoginLayout: React.FC<LoginLayoutProps> = ({
  loginError,
  isLoggingIn,
  uidInputRef,
  onLogin
}) => {
  const [uid, setUid] = useState('');
  const [pwd, setPwd] = useState('');
  const pwdInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uid.trim()) {
      showRequiredFieldMessage('請輸入使用者帳號。', uidInputRef.current);
      return;
    }

    if (!pwd.trim()) {
      showRequiredFieldMessage('請輸入密碼。', pwdInputRef.current);
      return;
    }

    const success = await onLogin(uid, pwd);
    if (!success) {
      setUid('');
      setPwd('');
    }
  };

  return (
    <div id="login-container" className="fade-in">
      <Modal
        isOpen
        onClose={() => undefined}
        title={
          <span className="login-title-row">
            <span>文件管理系統</span>
            <span className="login-title-version">{APP_VERSION_LABEL}</span>
          </span>
        }
        closeOnOverlayClick={false}
        contentClassName="login-modal"
        showCloseButton={false}
        footer={
          <button
            type="submit"
            form="login-form"
            className="btn btn-primary btn-block"
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <>
                <svg className="spinner" viewBox="0 0 50 50" style={{ width: 18, height: 18, marginRight: 8, stroke: 'currentColor' }}>
                  <circle cx="25" cy="25" r="20" fill="none" strokeWidth="4" style={{ strokeDasharray: '90, 150', strokeDashoffset: 0 }}></circle>
                </svg>
                <span>正在登入...</span>
              </>
            ) : (
              <>
                <span>登入系統</span>
                <ArrowForwardIcon size={18} />
              </>
            )}
          </button>
        }
      >
        <div className="login-header">
          <img src="/logo.png" alt="Logo" style={{ width: 48, height: 48, marginBottom: 12, borderRadius: 8, objectFit: 'contain' }} />
          <p>請輸入您的帳戶以存取平台</p>
        </div>
        <form id="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="uid">使用者帳號</label>
            <div className="input-wrapper">
              <PersonIcon className="input-icon" size={20} style={{ position: 'absolute', left: 12 }} />
              <input
                ref={uidInputRef}
                type="text"
                id="uid"
                value={uid}
                onChange={(e) => setUid(e.target.value.toUpperCase())}
                autoComplete="username"
              />
            </div>
          </div>
          <div className="input-group">
            <label htmlFor="pwd">密碼</label>
            <div className="input-wrapper">
              <LockIcon className="input-icon" size={20} style={{ position: 'absolute', left: 12 }} />
              <input
                ref={pwdInputRef}
                type="password"
                id="pwd"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>
          {loginError && (
            <div className="error-msg">
              <ErrorOutlineIcon size={18} />
              <span>{loginError}</span>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
};
