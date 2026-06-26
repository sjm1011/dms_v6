import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../Modal';
import { FoldersAPI } from '../../api/folders';
import { EmployeeAPI } from '../../api/employee';
import { Department } from '../../types';

interface FolderAclModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string;
  folderName: string;
  onSaved?: () => void;
}

interface UserRow {
  uid: string;
  name: string;
  isValid: boolean;
  isChecking: boolean;
}

const styles = `
  .acl-form {
    width: 100%;
    min-width: 0;
  }
  .acl-section {
    margin-top: 16px;
    animation: slideDown 0.3s ease-out forwards;
  }
  .acl-label {
    display: block;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
  }
  .access-type-selector {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    min-width: 0;
  }
  .access-type-btn {
    flex: 1;
    min-width: 0;
    padding: 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-border);
    background: rgba(255, 255, 255, 0.02);
    color: var(--text-secondary);
    cursor: pointer;
    font-weight: 600;
    font-size: 0.95rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .access-type-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--glass-border-hover);
  }
  .access-type-btn.active-public {
    background: rgba(16, 185, 129, 0.1);
    border-color: #10b981;
    color: #10b981;
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.2);
  }
  .access-type-btn.active-restricted {
    background: rgba(249, 115, 22, 0.1);
    border-color: #f97316;
    color: #f97316;
    box-shadow: 0 0 12px rgba(249, 115, 22, 0.2);
  }
  .depts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    padding: 12px;
    margin-bottom: 20px;
    max-height: 150px;
    overflow-y: auto;
  }
  .dept-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: var(--text-primary);
    cursor: pointer;
    padding: 4px;
    user-select: none;
  }
  .dept-item input[type="checkbox"] {
    cursor: pointer;
    accent-color: #f97316;
    width: 15px;
    height: 15px;
    margin: 0;
  }
  .users-section {
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed var(--glass-border);
    border-radius: var(--radius-sm);
    padding: 12px;
  }
  .users-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .btn-add-user {
    background: rgba(249, 115, 22, 0.15);
    border: 1px solid rgba(249, 115, 22, 0.3);
    color: #f97316;
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }
  .btn-add-user:hover {
    background: rgba(249, 115, 22, 0.25);
    border-color: #f97316;
  }
  .user-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    animation: fadeIn 0.2s forwards;
    min-width: 0;
  }
  .user-row input[type="text"] {
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
    height: 33px;
    margin: 0;
  }
  .user-row input[type="text"]:focus {
    border-color: #f97316;
  }
  .user-name-display {
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
    height: 33px;
    display: flex;
    align-items: center;
    margin: 0;
  }
  .user-name-display.valid {
    color: #10b981;
    font-weight: bold;
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.05);
  }
  .user-name-display.invalid {
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
  .validation-error {
    color: #ef4444;
    font-size: 0.8rem;
    margin-top: 6px;
  }
  @media (max-width: 560px) {
    .access-type-selector,
    .user-row {
      flex-direction: column;
      align-items: stretch;
    }

    .depts-grid {
      grid-template-columns: 1fr;
    }

    .btn-remove-row {
      align-self: flex-end;
    }
  }
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

export const FolderAclModal: React.FC<FolderAclModalProps> = ({
  isOpen,
  onClose,
  folderId,
  folderName,
  onSaved
}) => {
  const [accessType, setAccessType] = useState<number>(1); // 1: 公開, 2: 限閱
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [userRows, setUserRows] = useState<UserRow[]>([{ uid: '', name: '', isValid: false, isChecking: false }]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const userInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // 1. 初始化載入部門列表與現有 ACL 設定
  useEffect(() => {
    if (isOpen && folderId) {
      setLoading(true);
      setError('');
      setSelectedDepts([]);
      setUserRows([{ uid: '', name: '', isValid: false, isChecking: false }]);
      
      const initData = async () => {
        try {
          // 載入部門列表
          const deptRes = await EmployeeAPI.getDepartments();
          if (deptRes.success) {
            setDepartments(deptRes.data);
          }

          // 載入當前資料夾權限
          const aclRes = await FoldersAPI.getFolderACL(folderId);
          if (aclRes.success && aclRes.data) {
            setAccessType(aclRes.data.access_type);
            setSelectedDepts(aclRes.data.dept_ids || []);
            
            // 查詢已授權同仁姓名
            if (aclRes.data.uids && aclRes.data.uids.length > 0) {
              const rows: UserRow[] = [];
              for (const uid of aclRes.data.uids) {
                try {
                  const empRes = await EmployeeAPI.getEmployeeByUid(uid);
                  if (empRes.success && empRes.data && empRes.data.length > 0) {
                    rows.push({
                      uid,
                      name: empRes.data[0].name,
                      isValid: true,
                      isChecking: false
                    });
                  } else {
                    rows.push({
                      uid,
                      name: '未知同仁',
                      isValid: false,
                      isChecking: false
                    });
                  }
                } catch {
                  rows.push({
                    uid,
                    name: '查詢失敗',
                    isValid: false,
                    isChecking: false
                  });
                }
              }
              // 自動在尾端追加一行空白列以利新增授權
              rows.push({ uid: '', name: '', isValid: false, isChecking: false });
              setUserRows(rows);
            }
          } else if (aclRes.error) {
            setError(aclRes.error);
          }
        } catch (err: any) {
          setError(err.message || '資料載入失敗');
        } finally {
          setLoading(false);
        }
      };

      initData();
    }
  }, [isOpen, folderId]);

  // 2. 處理自動 Focus
  useEffect(() => {
    if (focusIndex !== null && userInputsRef.current[focusIndex]) {
      userInputsRef.current[focusIndex]?.focus();
      setFocusIndex(null);
    }
  }, [focusIndex]);

  // 3. 處理部門選取切換
  const handleDeptToggle = (deptId: string) => {
    setSelectedDepts(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    );
  };

  // 4. 處理使用者 UID 輸入變更
  const handleUidChange = (index: number, newUid: string) => {
    const updated = [...userRows];
    updated[index] = {
      ...updated[index],
      uid: newUid,
      name: '',
      isValid: false,
      isChecking: false
    };
    setUserRows(updated);
  };

  // 5. 使用者 UID 輸入框按下 Enter 進行查詢
  const handleUidKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleUidBlur = async (index: number) => {
    const targetUid = userRows[index].uid.trim();
    if (!targetUid || userRows[index].isValid || userRows[index].isChecking) return;

    setUserRows(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], isChecking: true, name: '' };
      }
      return next;
    });

    try {
      const res = await EmployeeAPI.getEmployeeByUid(targetUid);
      setUserRows(prev => {
        const next = [...prev];
        if (!next[index]) return prev;

        if (res.success && res.data && res.data.length > 0) {
          next[index] = {
            uid: res.data[0].uid,
            name: res.data[0].name,
            isValid: true,
            isChecking: false
          };

          // 驗證成功且是最後一列，則自動新增一列
          if (index === next.length - 1) {
            next.push({ uid: '', name: '', isValid: false, isChecking: false });
            setFocusIndex(index + 1);
          }
        } else {
          next[index] = {
            ...next[index],
            name: '查無此員工',
            isValid: false,
            isChecking: false
          };
        }
        return next;
      });
    } catch {
      setUserRows(prev => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = {
          ...next[index],
          name: '系統查詢錯誤',
          isValid: false,
          isChecking: false
        };
        return next;
      });
    }
  };



  // 7. 移除特定列
  const removeUserRow = (index: number) => {
    const updated = userRows.filter((_, i) => i !== index);
    setUserRows(updated.length === 0 ? [{ uid: '', name: '', isValid: false, isChecking: false }] : updated);
  };

  // 8. 存檔送出
  const handleSave = async () => {
    setError('');
    
    // 過濾出有效的同仁帳號
    const validUids = userRows
      .filter(r => r.uid.trim() !== '' && r.isValid)
      .map(r => r.uid.trim());

    setLoading(true);
    try {
      const res = await FoldersAPI.updateFolderACL(
        folderId,
        accessType,
        accessType === 1 ? [] : selectedDepts,
        accessType === 1 ? [] : validUids
      );

      if (res.success) {
        onSaved?.();
        onClose();
      } else {
        setError(res.error || '儲存權限設定失敗');
      }
    } catch (err: any) {
      setError(err.message || '儲存失敗，請重試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{styles}</style>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        closeOnOverlayClick={false}
        contentClassName="modal-content-wide"
        title={`權限設定 - ${folderName}`}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? '儲存中...' : '確定儲存'}
            </button>
          </>
        }
      >
        <div className="acl-form">
          <label className="acl-label">資料夾屬性</label>
          <div className="access-type-selector">
            <button
              type="button"
              className={`access-type-btn ${accessType === 1 ? 'active-public' : ''}`}
              onClick={() => setAccessType(1)}
            >
              <span>🌐</span> 公開
            </button>
            <button
              type="button"
              className={`access-type-btn ${accessType === 2 ? 'active-restricted' : ''}`}
              onClick={() => setAccessType(2)}
            >
              <span>🔒</span> 限閱
            </button>
          </div>

          {accessType === 2 && (
            <div className="acl-section">
              <label className="acl-label">1. 授權部門 (可多選)</label>
              {departments.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
                  載入部門清單中...
                </div>
              ) : (
                <div className="depts-grid">
                  {departments.map(dept => (
                    <label key={dept.dept_id} className="dept-item">
                      <input
                        type="checkbox"
                        checked={selectedDepts.includes(dept.dept_id)}
                        onChange={() => handleDeptToggle(dept.dept_id)}
                      />
                      <span>{dept.dept_name}</span>
                    </label>
                  ))}
                </div>
              )}

              <div className="users-section">
                <div className="users-title">
                  <span>2. 授權特定同仁</span>
                </div>
                {userRows.map((row, index) => (
                  <div key={index} className="user-row">
                    <input
                      type="text"
                      ref={el => {
                        userInputsRef.current[index] = el;
                      }}
                      placeholder="請輸入同仁帳號"
                      value={row.uid}
                      onChange={e => handleUidChange(index, e.target.value)}
                      onKeyDown={handleUidKeyDown}
                      onBlur={() => handleUidBlur(index)}
                      disabled={loading}
                    />
                    <div
                      className={`user-name-display ${
                        row.isChecking
                          ? ''
                          : row.isValid
                          ? 'valid'
                          : row.uid
                          ? 'invalid'
                          : ''
                      }`}
                    >
                      {row.isChecking ? '查詢中...' : row.name || (row.uid ? '尚未驗證 (Enter 驗證)' : '等待輸入')}
                    </div>
                    <button
                      type="button"
                      className="btn-remove-row"
                      onClick={() => removeUserRow(index)}
                      title="移除此行"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="validation-error">{error}</div>}
        </div>
      </Modal>
    </>
  );
};
