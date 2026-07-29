import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../Modal';
import { EmployeeAPI } from '../../api/employee';
import { showRequiredFieldMessage } from '../../lib/clientValidation';

const styles = `
  .managers-section {
    margin-top: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed var(--glass-border);
    border-radius: var(--radius-sm);
    padding: 12px;
    animation: fadeIn var(--transition-normal) forwards;
  }
  .managers-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
  }
  .manager-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: var(--text-primary);
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    transition: background-color 0.2s;
    user-select: none;
    -webkit-user-select: none;
  }
  .manager-item:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }
  .manager-item input[type="checkbox"] {
    cursor: pointer;
    accent-color: var(--accent-blue);
    width: 15px;
    height: 15px;
  }
  .validation-error {
    color: #ef4444;
    font-size: 0.8rem;
    margin-top: 6px;
  }
  .manager-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    animation: fadeIn 0.2s forwards;
    min-width: 0;
  }
  .manager-row input[type="text"] {
    flex: 1;
    min-width: 0;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--glass-border);
    color: var(--text-primary);
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
    height: var(--modal-control-height);
    min-height: var(--modal-control-height);
    margin: 0;
    align-self: center;
  }
  .manager-row input[type="text"]:focus {
    border-color: var(--accent-blue);
  }
  .manager-name-display {
    flex: 1.2;
    min-width: 0;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--glass-border);
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-sizing: border-box;
    height: var(--modal-control-height);
    min-height: var(--modal-control-height);
    display: flex;
    align-items: center;
    margin: 0;
    align-self: center;
  }
  .manager-name-display.valid {
    color: #10b981;
    font-weight: bold;
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.05);
  }
  .manager-name-display.invalid {
    color: #ef4444;
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.05);
  }
  .btn-remove-row {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }
  .btn-remove-row:hover {
    color: #ef4444;
  }
  @media (max-width: 560px) {
    .manager-row {
      flex-direction: column;
      align-items: stretch;
    }

    .btn-remove-row {
      align-self: flex-end;
    }
  }
`;

// --- 1. 建立資料夾 Modal ---
interface NewFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    managers?: string[]
  ) => Promise<{ id: string; name: string } | null>;
  isRoot?: boolean;
  userRole?: string;
  lookupFolderId?: string;
}

interface ManagerRow {
  uid: string;
  name: string;
  isValid: boolean;
  isChecking: boolean;
}

export const NewFolderModal: React.FC<NewFolderModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  isRoot = false,
  userRole = '',
  lookupFolderId
}) => {
  const [name, setName] = useState('');
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [managerRows, setManagerRows] = useState<ManagerRow[]>([{ uid: '', name: '', isValid: false, isChecking: false }]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const managerInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const isOpenRef = useRef(isOpen);
  const lookupFolderIdRef = useRef(lookupFolderId);

  useEffect(() => {
    isOpenRef.current = isOpen;
    lookupFolderIdRef.current = lookupFolderId;
    if (isOpen) {
      setName('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      if (isRoot && userRole === 'ADMIN') {
        setIsSystemAdmin(false);
        setManagerRows([{ uid: '', name: '', isValid: false, isChecking: false }]);
      } else {
        setIsSystemAdmin(false);
        setManagerRows([{ uid: '', name: '', isValid: false, isChecking: false }]);
      }
    } else {
      setManagerRows([{ uid: '', name: '', isValid: false, isChecking: false }]);
      managerInputsRef.current = [];
    }
  }, [isOpen, isRoot, userRole, lookupFolderId]);

  useEffect(() => {
    if (focusIndex !== null && managerInputsRef.current[focusIndex]) {
      managerInputsRef.current[focusIndex]?.focus();
      setFocusIndex(null);
    }
  }, [focusIndex]);

  const handleUidChange = (index: number, newUid: string) => {
    const updatedRows = [...managerRows];
    updatedRows[index] = {
      ...updatedRows[index],
      uid: newUid,
      name: '',
      isValid: false,
      isChecking: false
    };
    setManagerRows(updatedRows);
  };

  const handleUidKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleUidBlur = async (index: number) => {
    const trimmed = managerRows[index].uid.trim();
    if (trimmed === '' || managerRows[index].isValid || managerRows[index].isChecking) return;

    setManagerRows(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], isChecking: true, name: '' };
      }
      return next;
    });

    try {
      const res = await EmployeeAPI.getEmployeeByUid(trimmed, 'folder_manager', lookupFolderId);
      if (!isOpenRef.current || lookupFolderIdRef.current !== lookupFolderId) return;
      setManagerRows(prev => {
        const next = [...prev];
        if (!next[index]) return prev;

        if (res.success && res.data && res.data.length > 0) {
          const foundUser = res.data.find(u => u.uid.toLowerCase() === trimmed.toLowerCase());
          if (foundUser) {
            next[index] = {
              uid: foundUser.uid,
              name: foundUser.name,
              isValid: true,
              isChecking: false
            };

            // 當確認有這位使用者後，且該列是最後一列時，才長出新的一行
            if (!isRoot && index === next.length - 1) {
              next.push({ uid: '', name: '', isValid: false, isChecking: false });
              setFocusIndex(index + 1);
            }
          } else {
            next[index] = {
              ...next[index],
              name: '查無此用戶',
              isValid: false,
              isChecking: false
            };
          }
        } else {
          next[index] = {
            ...next[index],
            name: '查無此用戶',
            isValid: false,
            isChecking: false
          };
        }
        return next;
      });
    } catch (err) {
      console.error('Lookup failed', err);
      setManagerRows(prev => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = {
          ...next[index],
          name: '檢索錯誤',
          isValid: false,
          isChecking: false
        };
        return next;
      });
    }
  };

  const removeRow = (index: number) => {
    const updatedRows = managerRows.filter((_, i) => i !== index);
    if (updatedRows.length === 0) {
      updatedRows.push({ uid: '', name: '', isValid: false, isChecking: false });
    }
    managerInputsRef.current.splice(index, 1);
    setManagerRows(updatedRows);
  };

  const handleConfirm = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showRequiredFieldMessage('請輸入資料夾名稱。', inputRef.current);
      return;
    }

    const showManagers = false;
    if (showManagers) {
      {
        const validUids = managerRows
          .filter(r => r.uid.trim() !== '' && r.isValid)
          .map(r => r.uid.trim());
        const invalidIndex = managerRows.findIndex(
          r => r.uid.trim() !== '' && r.name !== '' && !r.isValid && !r.isChecking
        );
        if (invalidIndex >= 0) {
          showRequiredFieldMessage('請修正或移除查無此人的無效用戶代碼。', managerInputsRef.current[invalidIndex]);
          return;
        }
        if (isRoot && validUids.length !== 1) {
          showRequiredFieldMessage('第一層資料夾必須且只能輸入一位有效的資料夾管理員。', managerInputsRef.current[0]);
          return;
        }
        const created = await onCreate(trimmed, validUids);
        if (created) onClose();
      }
    } else {
      const created = await onCreate(trimmed);
      if (created) onClose();
    }
  };

  const hasInvalidRow = managerRows.some(
    r => r.uid.trim() !== '' && r.name !== '' && !r.isValid && !r.isChecking
  );
  const validUids = managerRows.filter(r => r.uid.trim() !== '' && r.isValid);

  const showManagers = false;

  return (
    <Modal
      closeOnOverlayClick={false}
      isOpen={isOpen}
      onClose={onClose}
      title="建立資料夾"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleConfirm}>建立</button>
        </>
      }
    >
      <style>{styles}</style>
      <div className="input-group" style={{ marginBottom: 0 }}>
        <label>資料夾名稱</label>
        <input
          ref={inputRef}
          type="text"
          placeholder="請輸入新資料夾名稱，如: 資訊部專區"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleConfirm()}
        />
      </div>

      {showManagers && (
        <div className="managers-section">
          <div className="managers-title">
            <span>{isRoot ? '指派資料夾管理員' : '指派協同管理員'}</span>
          </div>
          
          {isRoot ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label 
                 className="manager-item" 
                 style={{ display: 'none' }}
              >
                <input
                  type="checkbox"
                  checked={isSystemAdmin}
                  onChange={() => {
                    setIsSystemAdmin(prev => {
                      const next = !prev;
                      if (!next) {
                        setFocusIndex(0);
                      }
                      return next;
                    });
                  }}
                  style={{ accentColor: 'var(--accent-blue)', width: '16px', height: '16px', cursor: 'pointer', margin: 0 }}
                />
                <span style={{ fontWeight: 600, cursor: 'pointer', paddingLeft: '8px', lineHeight: 1 }}>
                  系統管理員
                </span>
              </label>

              {!isSystemAdmin && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', animation: 'fadeIn 0.2s forwards' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    資料夾管理員員工編號
                  </label>
                  {managerRows.map((row, idx) => (
                    <div key={idx} className="manager-row">
                      <input
                        ref={(el) => { managerInputsRef.current[idx] = el; }}
                        type="text"
                        placeholder="請輸入員工編號"
                        value={row.uid}
                        onChange={(e) => handleUidChange(idx, e.target.value)}
                        data-enter-action="blur-or-submit"
                        onKeyDown={handleUidKeyDown}
                        onBlur={() => handleUidBlur(idx)}
                      />
                      <div className={`manager-name-display ${row.isValid ? 'valid' : (row.uid.trim() !== '' && !row.isChecking ? 'invalid' : '')}`}>
                        {row.isChecking ? '檢查中...' : row.name}
                      </div>
                      {managerRows.length > 1 && (
                        <button
                          type="button"
                          className="btn-remove-row"
                          onClick={() => removeRow(idx)}
                          title="移除此列"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {managerRows.map((row, idx) => (
                <div key={idx} className="manager-row">
                  <input
                    ref={(el) => { managerInputsRef.current[idx] = el; }}
                    type="text"
                    placeholder="請輸入員工編號"
                    value={row.uid}
                    onChange={(e) => handleUidChange(idx, e.target.value)}
                    data-enter-action="blur-or-submit"
                    onKeyDown={handleUidKeyDown}
                    onBlur={() => handleUidBlur(idx)}
                  />
                  <div className={`manager-name-display ${row.isValid ? 'valid' : (row.uid.trim() !== '' && !row.isChecking ? 'invalid' : '')}`}>
                    {row.isChecking ? '檢查中...' : row.name}
                  </div>
                  {managerRows.length > 1 && (
                    <button
                      type="button"
                      className="btn-remove-row"
                      onClick={() => removeRow(idx)}
                      title="移除此列"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isRoot && validUids.length !== 1 && (
            <div className="validation-error">「第一層資料夾必須且只能指派一位資料夾管理員」</div>
          )}
          {hasInvalidRow && (
            <div className="validation-error">「請修正或移除查無此人的無效用戶代碼」</div>
          )}
        </div>
      )}
    </Modal>
  );
};

// --- 2. 重新命名 Modal (適用資料夾/文件) ---
interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialValue: string;
  isRoot?: boolean;
  initialManagers?: string[];
  userRole?: string;
  managersOnly?: boolean;
  showManagerEditor?: boolean;
  lookupFolderId: string;
  onRename: (newName: string, managers?: string[]) => Promise<boolean>;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  onClose,
  initialValue,
  isRoot = false,
  initialManagers = [],
  userRole = '',
  managersOnly = false,
  showManagerEditor = false,
  lookupFolderId,
  onRename
}) => {
  const [val, setVal] = useState('');
  const [isSystemAdmin, setIsSystemAdmin] = useState(true);
  const [managerRows, setManagerRows] = useState<ManagerRow[]>([{ uid: '', name: '', isValid: false, isChecking: false }]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const managerInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const isOpenRef = useRef(isOpen);
  const lookupFolderIdRef = useRef(lookupFolderId);

  useEffect(() => {
    isOpenRef.current = isOpen;
    lookupFolderIdRef.current = lookupFolderId;
    if (isOpen) {
      setVal(initialValue);
      if (!managersOnly) {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      }

      if (isRoot ? userRole === 'ADMIN' : true) {
        const isSysAdminOnly = isRoot ? (initialManagers.length === 0) : false;

        if (isSysAdminOnly && isRoot) {
          setIsSystemAdmin(true);
          setManagerRows([{ uid: '', name: '', isValid: false, isChecking: false }]);
        } else {
          setIsSystemAdmin(false);
          const fetchInitialManagers = async () => {
            const loadedRows: ManagerRow[] = await Promise.all(
              initialManagers.map(async (uid) => {
                try {
                  const res = await EmployeeAPI.getEmployeeByUid(uid, 'folder_manager', lookupFolderId);
                  if (res.success && res.data && res.data.length > 0) {
                    const found = res.data.find(u => u.uid.toLowerCase() === uid.toLowerCase());
                    if (found) {
                      return { uid, name: found.name, isValid: true, isChecking: false };
                    }
                  }
                  return { uid, name: '查無此用戶', isValid: false, isChecking: false };
                } catch (err) {
                  console.error('載入管理員資料失敗。', err);
                  return { uid, name: '檢索錯誤', isValid: false, isChecking: false };
                }
              })
            );
            if (!isOpenRef.current || lookupFolderIdRef.current !== lookupFolderId) return;
            loadedRows.push({ uid: '', name: '', isValid: false, isChecking: false });
            setManagerRows(loadedRows);
            if (managersOnly) {
              setFocusIndex(0);
            }
          };

          fetchInitialManagers();
        }
      }
    } else {
      setManagerRows([{ uid: '', name: '', isValid: false, isChecking: false }]);
      managerInputsRef.current = [];
    }
  }, [isOpen, initialValue, isRoot, userRole, initialManagers, managersOnly, lookupFolderId]);

  useEffect(() => {
    if (focusIndex !== null && managerInputsRef.current[focusIndex]) {
      managerInputsRef.current[focusIndex]?.focus();
      setFocusIndex(null);
    }
  }, [focusIndex]);

  const handleUidChange = (index: number, newUid: string) => {
    const updatedRows = [...managerRows];
    updatedRows[index] = {
      ...updatedRows[index],
      uid: newUid,
      name: '',
      isValid: false,
      isChecking: false
    };
    setManagerRows(updatedRows);
  };

  const handleUidKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleUidBlur = async (index: number) => {
    const trimmed = managerRows[index].uid.trim();
    if (trimmed === '' || managerRows[index].isValid || managerRows[index].isChecking) return;

    setManagerRows(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], isChecking: true, name: '' };
      }
      return next;
    });

    try {
      const res = await EmployeeAPI.getEmployeeByUid(trimmed, 'folder_manager', lookupFolderId);
      if (!isOpenRef.current || lookupFolderIdRef.current !== lookupFolderId) return;
      setManagerRows(prev => {
        const next = [...prev];
        if (!next[index]) return prev;

        if (res.success && res.data && res.data.length > 0) {
          const foundUser = res.data.find(u => u.uid.toLowerCase() === trimmed.toLowerCase());
          if (foundUser) {
            next[index] = {
              uid: foundUser.uid,
              name: foundUser.name,
              isValid: true,
              isChecking: false
            };

            // 當確認有這位使用者後，且該列是最後一列時，才長出新的一行
            if (index === next.length - 1) {
              next.push({ uid: '', name: '', isValid: false, isChecking: false });
              setFocusIndex(index + 1);
            }
          } else {
            next[index] = {
              ...next[index],
              name: '查無此用戶',
              isValid: false,
              isChecking: false
            };
          }
        } else {
          next[index] = {
            ...next[index],
            name: '查無此用戶',
            isValid: false,
            isChecking: false
          };
        }
        return next;
      });
    } catch (err) {
      console.error('Lookup failed', err);
      setManagerRows(prev => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = {
          ...next[index],
          name: '檢索錯誤',
          isValid: false,
          isChecking: false
        };
        return next;
      });
    }
  };

  const removeRow = (index: number) => {
    const updatedRows = managerRows.filter((_, i) => i !== index);
    if (updatedRows.length === 0) {
      updatedRows.push({ uid: '', name: '', isValid: false, isChecking: false });
    }
    managerInputsRef.current.splice(index, 1);
    setManagerRows(updatedRows);
  };

  const handleConfirm = async () => {
    const trimmed = val.trim();
    if (!trimmed) {
      showRequiredFieldMessage('請輸入資料夾名稱。', inputRef.current);
      return;
    }

    const showManagers = showManagerEditor;
    if (showManagers) {
      if (isRoot && isSystemAdmin) {
        const success = await onRename(trimmed, []);
        if (success) onClose();
      } else {
        const validUids = managerRows
          .filter(r => r.uid.trim() !== '' && r.isValid)
          .map(r => r.uid.trim());
        const invalidIndex = managerRows.findIndex(
          r => r.uid.trim() !== '' && r.name !== '' && !r.isValid && !r.isChecking
        );
        if (invalidIndex >= 0) {
          showRequiredFieldMessage('請修正或移除查無此人的無效用戶代碼。', managerInputsRef.current[invalidIndex]);
          return;
        }
        if (isRoot && validUids.length === 0) {
          showRequiredFieldMessage('請最少輸入一位有效的資料夾管理員。', managerInputsRef.current[0]);
          return;
        }
        const success = await onRename(trimmed, validUids);
        if (success) onClose();
      }
    } else {
      const success = await onRename(trimmed);
      if (success) onClose();
    }
  };

  const hasInvalidRow = managerRows.some(
    r => r.uid.trim() !== '' && r.name !== '' && !r.isValid && !r.isChecking
  );
  const validUids = managerRows.filter(r => r.uid.trim() !== '' && r.isValid);

  const showManagers = showManagerEditor;

  return (
    <Modal
      closeOnOverlayClick={false}
      isOpen={isOpen}
      onClose={onClose}
      title={managersOnly ? '編輯管理員' : '修改資料夾'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleConfirm}>確定</button>
        </>
      }
    >
      <style>{styles}</style>
      {!managersOnly && (
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>資料夾名稱</label>
          <input
            ref={inputRef}
            type="text"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleConfirm()}
          />
        </div>
      )}

      {showManagers && (
        <div className="managers-section">
          <div className="managers-title">
            <span>{isRoot ? '指派管理員' : '加入其他管理員'}</span>
          </div>

          {isRoot ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label 
                className="manager-item" 
                style={{ padding: '4px 6px', display: 'flex', alignItems: 'center', userSelect: 'none', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={isSystemAdmin}
                  onChange={() => {
                    setIsSystemAdmin(prev => {
                      const next = !prev;
                      if (!next) {
                        setFocusIndex(0);
                      }
                      return next;
                    });
                  }}
                  style={{ accentColor: 'var(--accent-blue)', width: '16px', height: '16px', cursor: 'pointer', margin: 0 }}
                />
                <span style={{ fontWeight: 600, cursor: 'pointer', paddingLeft: '8px', lineHeight: 1 }}>
                  系統管理員
                </span>
              </label>

              {!isSystemAdmin && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', animation: 'fadeIn 0.2s forwards' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    自訂管理員用戶代碼
                  </label>
                  {managerRows.map((row, idx) => (
                    <div key={idx} className="manager-row">
                      <input
                        ref={(el) => { managerInputsRef.current[idx] = el; }}
                        type="text"
                        placeholder="請輸入員工編號"
                        value={row.uid}
                        onChange={(e) => handleUidChange(idx, e.target.value)}
                        data-enter-action="blur-or-submit"
                        onKeyDown={handleUidKeyDown}
                        onBlur={() => handleUidBlur(idx)}
                      />
                      <div className={`manager-name-display ${row.isValid ? 'valid' : (row.uid.trim() !== '' && !row.isChecking ? 'invalid' : '')}`}>
                        {row.isChecking ? '檢查中...' : row.name}
                      </div>
                      {managerRows.length > 1 && (
                        <button
                          type="button"
                          className="btn-remove-row"
                          onClick={() => removeRow(idx)}
                          title="移除此列"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {managerRows.map((row, idx) => (
                <div key={idx} className="manager-row">
                  <input
                    ref={(el) => { managerInputsRef.current[idx] = el; }}
                    type="text"
                    placeholder="請輸入員工編號"
                    value={row.uid}
                    onChange={(e) => handleUidChange(idx, e.target.value)}
                    data-enter-action="blur-or-submit"
                    onKeyDown={handleUidKeyDown}
                    onBlur={() => handleUidBlur(idx)}
                  />
                  <div className={`manager-name-display ${row.isValid ? 'valid' : (row.uid.trim() !== '' && !row.isChecking ? 'invalid' : '')}`}>
                    {row.isChecking ? '檢查中...' : row.name}
                  </div>
                  {managerRows.length > 1 && (
                    <button
                      type="button"
                      className="btn-remove-row"
                      onClick={() => removeRow(idx)}
                      title="移除此列"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isRoot && !isSystemAdmin && validUids.length === 0 && (
            <div className="validation-error">「請最少輸入一位有效的資料夾管理員」</div>
          )}
          {hasInvalidRow && (
            <div className="validation-error">「請修正或移除查無此人的無效用戶代碼」</div>
          )}
        </div>
      )}
    </Modal>
  );
};

// --- 3. 封存資料夾 Modal ---
interface ArchiveFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  onArchive: () => Promise<boolean>;
}

export const ArchiveFolderModal: React.FC<ArchiveFolderModalProps> = ({ isOpen, onClose, targetName, onArchive }) => {
  const handleConfirm = async () => {
    const success = await onArchive();
    if (success) {
      onClose();
    }
  };

  return (
    <Modal
      closeOnOverlayClick={false}
      isOpen={isOpen}
      onClose={onClose}
      title="封存資料夾警告"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-danger" onClick={handleConfirm}>確認封存</button>
        </>
      }
    >
      <div style={{ lineHeight: 1.6 }}>
        <p>您即將進行資料夾「<strong>{targetName}</strong>」的封存操作。</p>
        <p style={{ color: 'var(--color-danger)', fontWeight: 600, marginTop: 8 }}>
          請注意：此操作為不可逆，封存後該資料夾轄下的所有子資料夾將一併封存。
        </p>
      </div>
    </Modal>
  );
};

// --- 4. 刪除（作廢）空資料夾 Modal ---
interface DeleteFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  onDelete: () => Promise<boolean>;
}

export const DeleteFolderModal: React.FC<DeleteFolderModalProps> = ({ isOpen, onClose, targetName, onDelete }) => {
  const handleConfirm = async () => {
    const success = await onDelete();
    if (success) {
      onClose();
    }
  };

  return (
    <Modal
      closeOnOverlayClick={false}
      isOpen={isOpen}
      onClose={onClose}
      title="刪除（作廢）資料夾"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-danger" onClick={handleConfirm}>確認刪除（作廢）</button>
        </>
      }
    >
      <div style={{ lineHeight: 1.6 }}>
        <p>您即將刪除（作廢）資料夾「<strong>{targetName}</strong>」。</p>
        <p style={{ color: 'var(--color-danger)', fontWeight: 600, marginTop: 8 }}>
          此操作僅允許用於沒有任何文件與子資料夾的空資料夾，確認後資料夾狀態將更新為 0。
        </p>
      </div>
    </Modal>
  );
};
