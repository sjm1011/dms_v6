import React from 'react';
import { Modal } from '../Modal';
import {
  CheckCircleIcon,
  ErrorOutlineIcon
} from '../Icons';

// --- 1. 全域錯誤訊息彈窗 ---
interface ErrorDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export const ErrorDetailModal: React.FC<ErrorDetailModalProps> = ({ isOpen, onClose, title, message }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || '系統錯誤'}
      useNativeDialog
      closeOnOverlayClick={false}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          確定
        </button>
      }
    >
      <div style={{ 
        color: 'var(--color-danger)', 
        fontSize: '1rem', 
        whiteSpace: 'pre-wrap', 
        wordBreak: 'break-all', 
        maxHeight: '400px', 
        overflowY: 'auto', 
        padding: '8px 4px',
        lineHeight: '1.5'
      }}>
        {message}
      </div>
    </Modal>
  );
};

// --- 2. /test 驗證測試結果彈窗 ---
interface TestResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: { success: boolean; data?: any; error?: string } | null;
}

export const TestResultModal: React.FC<TestResultModalProps> = ({ isOpen, onClose, result }) => {
  if (!result) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="登入後 /test API 測試結果"
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          關閉
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {result.success ? (
          <>
            <div style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircleIcon size={20} />
              <span>測試連線成功！</span>
            </div>
            <div style={{ border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', padding: '12px', backgroundColor: 'var(--bg-secondary)' }}>
              <pre style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          </>
        ) : (
          <>
            <div style={{ color: 'var(--color-danger)', fontWeight: 600, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ErrorOutlineIcon size={20} />
              <span>測試連線失敗！</span>
            </div>
            <div style={{ border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', padding: '12px', backgroundColor: 'var(--bg-secondary)', color: 'var(--color-danger)' }}>
              <pre style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {result.error || '未知的錯誤訊息'}
              </pre>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
