import React, { useEffect, useRef, useState } from 'react';
import { EmployeeAPI } from '../../api/employee';
import { showRequiredFieldMessage } from '../../lib/clientValidation';
import type { FolderManagerAssignmentType } from '../../types';
import { Modal } from '../Modal';

interface ManagerRow {
  uid: string;
  name: string;
  isValid: boolean;
  isChecking: boolean;
}

interface FolderManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string;
  assignmentType: FolderManagerAssignmentType;
  initialManagers: string[];
  onSave: (managers: string[]) => Promise<boolean>;
}

const emptyRow = (): ManagerRow => ({ uid: '', name: '', isValid: false, isChecking: false });

export const FolderManagerModal: React.FC<FolderManagerModalProps> = ({
  isOpen,
  onClose,
  folderId,
  assignmentType,
  initialManagers,
  onSave
}) => {
  const [rows, setRows] = useState<ManagerRow[]>([emptyRow()]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const isPrimary = assignmentType === 'PRIMARY';

  useEffect(() => {
    if (!isOpen) {
      setRows([emptyRow()]);
      inputRefs.current = [];
      return;
    }

    let active = true;
    const load = async () => {
      const loaded = await Promise.all(initialManagers.map(async (uid): Promise<ManagerRow> => {
        try {
          const response = await EmployeeAPI.getEmployeeByUid(uid, 'folder_manager', folderId);
          const employee = response.success
            ? response.data.find((item) => item.uid.toUpperCase() === uid.toUpperCase())
            : undefined;
          return employee
            ? { uid: employee.uid, name: employee.name, isValid: true, isChecking: false }
            : { uid, name: '查無此使用者', isValid: false, isChecking: false };
        } catch {
          return { uid, name: '檢索失敗', isValid: false, isChecking: false };
        }
      }));

      if (!active) return;
      if (!isPrimary) loaded.push(emptyRow());
      setRows(loaded.length > 0 ? loaded : [emptyRow()]);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    };

    void load();
    return () => {
      active = false;
    };
  }, [assignmentType, folderId, initialManagers, isOpen, isPrimary]);

  const updateUid = (index: number, uid: string) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index
      ? { ...row, uid, name: '', isValid: false, isChecking: false }
      : row));
  };

  const verifyUid = async (index: number) => {
    const uid = rows[index]?.uid.trim();
    if (!uid || rows[index]?.isValid || rows[index]?.isChecking) return;

    setRows((current) => current.map((row, rowIndex) => rowIndex === index
      ? { ...row, name: '', isChecking: true }
      : row));

    try {
      const response = await EmployeeAPI.getEmployeeByUid(uid, 'folder_manager', folderId);
      const employee = response.success
        ? response.data.find((item) => item.uid.toUpperCase() === uid.toUpperCase())
        : undefined;

      setRows((current) => {
        const next = [...current];
        next[index] = employee
          ? { uid: employee.uid, name: employee.name, isValid: true, isChecking: false }
          : { uid, name: '查無此使用者', isValid: false, isChecking: false };
        if (employee && !isPrimary && index === next.length - 1) {
          next.push(emptyRow());
          setTimeout(() => inputRefs.current[index + 1]?.focus(), 0);
        }
        return next;
      });
    } catch {
      setRows((current) => current.map((row, rowIndex) => rowIndex === index
        ? { ...row, name: '檢索失敗', isValid: false, isChecking: false }
        : row));
    }
  };

  const removeRow = (index: number) => {
    setRows((current) => {
      const next = current.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [emptyRow()];
    });
  };

  const save = async () => {
    const invalidIndex = rows.findIndex((row) => row.uid.trim() !== '' && !row.isValid);
    if (invalidIndex >= 0) {
      showRequiredFieldMessage('請修正或移除無效的員工編號。', inputRefs.current[invalidIndex]);
      return;
    }

    const managers = rows.filter((row) => row.isValid).map((row) => row.uid.trim());
    if (isPrimary && managers.length > 1) {
      showRequiredFieldMessage('第一層資料夾最多只能指定一名資料夾管理員。', inputRefs.current[0]);
      return;
    }

    if (await onSave(managers)) {
      onClose();
    }
  };

  return (
    <Modal
      closeOnOverlayClick={false}
      isOpen={isOpen}
      onClose={onClose}
      title={isPrimary ? '更換資料夾管理員' : '編輯協同管理員'}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={() => void save()}>確定</button>
        </>
      )}
    >
      <style>{`
        .managers-section { padding: 12px; border: 1px dashed var(--glass-border); border-radius: var(--radius-sm); }
        .managers-title { margin-bottom: 8px; color: var(--text-secondary); font-weight: 600; }
        .manager-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .manager-row input { flex: 1; min-width: 0; height: 36px; margin: 0; }
        .manager-name-display { flex: 1; min-height: 36px; padding: 7px 10px; border: 1px solid var(--glass-border); border-radius: var(--radius-sm); }
        .manager-name-display.valid { color: #10b981; border-color: rgba(16, 185, 129, 0.4); }
        .manager-name-display.invalid { color: #ef4444; border-color: rgba(239, 68, 68, 0.4); }
        .btn-remove-row { border: 0; background: transparent; color: #ef4444; cursor: pointer; }
        .validation-error { margin-top: 6px; color: var(--text-secondary); font-size: 0.8rem; }
      `}</style>
      <div className="managers-section">
        <div className="managers-title">
          <span>{isPrimary ? '資料夾管理員' : '協同管理員'}</span>
        </div>
        {rows.map((row, index) => (
          <div className="manager-row" key={index}>
            <input
              ref={(element) => { inputRefs.current[index] = element; }}
              type="text"
              placeholder="請輸入員工編號"
              value={row.uid}
              onChange={(event) => updateUid(index, event.target.value)}
              onBlur={() => void verifyUid(index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              data-enter-action="blur-or-submit"
            />
            <div className={`manager-name-display ${row.isValid ? 'valid' : (row.uid.trim() ? 'invalid' : '')}`}>
              {row.isChecking ? '檢查中...' : row.name}
            </div>
            {!isPrimary && rows.length > 1 && (
              <button className="btn-remove-row" type="button" onClick={() => removeRow(index)}>移除</button>
            )}
          </div>
        ))}
        <div className="validation-error">
          {isPrimary ? '每個第一層資料夾最多一名資料夾管理員；留空儲存即為未指派。' : '協同管理員不得再指派其他協同管理員。'}
        </div>
      </div>
    </Modal>
  );
};
