import React, { useState, useEffect, useRef } from 'react';
import { Document, DocumentSecurityLevel } from '../../types';
import { Modal } from '../Modal';
import {
  ErrorOutlineIcon,
  ChevronRightIcon
} from '../Icons';
import { showRequiredFieldMessage } from '../../lib/clientValidation';
import {
  getWindowsFileNameValidationError,
  hasWindowsBlockedFileNameCharacter,
  WINDOWS_FILE_NAME_VALIDATION_MESSAGE
} from '../../lib/documentFileName';

const CHANGE_NOTE_OPTIONS = [
  '初版發行',
  '內容修訂',
  '格式調整',
  '錯字或文字修正',
  '法規或制度更新',
  '流程變更',
  '組織或職責調整',
  '表單欄位調整',
  '附件或範本更新',
  '週期性檢討，內容無異動',
  '文件整併',
  '文件拆分',
  '替代舊版文件'
];

const SECURITY_LEVEL_OPTIONS: Array<{
  value: DocumentSecurityLevel;
  label: string;
}> = [
  { value: 1, label: '一般' },
  { value: 2, label: '敏感' },
  { value: 3, label: '機密' }
];

const getSecurityLevelLabel = (level?: DocumentSecurityLevel) => (
  SECURITY_LEVEL_OPTIONS.find(option => option.value === level)?.label || '一般'
);

export const ACCEPTED_DOCUMENT_FILE_TYPES = '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.jpg,.jpeg,.png,.gif,.tif,.tiff,.webp';

function getTodayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function isPdfFile(file: File | null) {
  return !!file && file.name.toLowerCase().endsWith('.pdf');
}

function getDocumentTitleFromFile(file: File | null) {
  if (!file) return '';

  const extensionIndex = file.name.lastIndexOf('.');
  return extensionIndex > 0 ? file.name.slice(0, extensionIndex) : file.name;
}

function toUpperValue(value: string) {
  return value.toUpperCase();
}

type DocumentFileNameField = 'code' | 'title' | 'version';
type DocumentFileNameErrors = Record<DocumentFileNameField, string | null>;

const EMPTY_FILE_NAME_ERRORS: DocumentFileNameErrors = {
  code: null,
  title: null,
  version: null
};

function useDocumentFileNameValidation() {
  const [errors, setErrors] = useState<DocumentFileNameErrors>(EMPTY_FILE_NAME_ERRORS);

  const setFieldError = (field: DocumentFileNameField, error: string | null) => {
    setErrors(current => ({ ...current, [field]: error }));
  };

  const acceptChange = (
    field: DocumentFileNameField,
    value: string,
    setValue: React.Dispatch<React.SetStateAction<string>>,
    transform: (nextValue: string) => string = nextValue => nextValue
  ) => {
    if (hasWindowsBlockedFileNameCharacter(value)) {
      setFieldError(field, WINDOWS_FILE_NAME_VALIDATION_MESSAGE);
      return;
    }

    setValue(transform(value));
    setFieldError(field, null);
  };

  const validateField = (field: DocumentFileNameField, value: string) => {
    const error = getWindowsFileNameValidationError(value);
    setFieldError(field, error);
    return !error;
  };

  const resetErrors = (values?: Partial<Record<DocumentFileNameField, string>>) => {
    setErrors({
      code: values?.code ? getWindowsFileNameValidationError(values.code) : null,
      title: values?.title ? getWindowsFileNameValidationError(values.title) : null,
      version: values?.version ? getWindowsFileNameValidationError(values.version) : null
    });
  };

  return {
    errors,
    acceptChange,
    validateField,
    setFieldError,
    resetErrors
  };
}

function FileNameValidationMessage({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;

  return (
    <div
      id={id}
      aria-live="polite"
      style={{ marginTop: 6, color: '#dc2626', fontSize: '0.82rem', lineHeight: 1.45 }}
    >
      {message}
    </div>
  );
}

interface ChangeNoteInputProps {
  value: string;
  selectId: string;
  onChange: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

function ChangeNoteInput({ value, selectId, onChange, inputRef }: ChangeNoteInputProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      style={{ position: 'relative', marginTop: 8 }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setIsOpen(false);
      }}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ marginTop: 0, paddingRight: 44 }}
      />
      <button
        type="button"
        className="btn-icon"
        aria-label="開啟異動說明常用片語"
        aria-expanded={isOpen}
        aria-controls={selectId}
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          position: 'absolute',
          top: 0,
          right: 4,
          width: 36,
          height: 'var(--modal-control-height)',
          padding: 0
        }}
      >
        <ChevronRightIcon size={18} style={{ transform: isOpen ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
      </button>
      {isOpen && (
        <div
          id={selectId}
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 'calc(100% + 6px)',
            zIndex: 140,
            maxHeight: 260,
            overflowY: 'auto',
            padding: 6,
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)'
          }}
        >
          {CHANGE_NOTE_OPTIONS.map(option => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                minHeight: 36,
                display: 'flex',
                alignItems: 'center',
                padding: '8px 10px',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: value === option ? 'var(--surface-hover)' : 'transparent',
                color: value === option ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                font: 'inherit',
                textAlign: 'left'
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface NewDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFile: File | null;
  parentDocument?: Document | null;
  allowConfidential?: boolean;
  onCreate: (
    code: string,
    title: string,
    version: string,
    changeNote: string,
    revisionDate: string,
    effAt: string,
    file: File,
    sourceFile?: File | null,
    securityLevel?: DocumentSecurityLevel
  ) => Promise<boolean>;
}

export const NewDocModal: React.FC<NewDocModalProps> = ({
  isOpen,
  onClose,
  initialFile,
  parentDocument = null,
  allowConfidential = true,
  onCreate
}) => {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');
  const [changeNote, setChangeNote] = useState('初版發行');
  const [revisionDate, setRevisionDate] = useState(getTodayString());
  const [effAt, setEffAt] = useState(getTodayString());
  const [file, setFile] = useState<File | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [securityLevel, setSecurityLevel] = useState<DocumentSecurityLevel>(1);
  const fileNameValidation = useDocumentFileNameValidation();

  const automaticTitleRef = useRef('');
  const codeInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const versionInputRef = useRef<HTMLInputElement>(null);
  const revisionDateInputRef = useRef<HTMLInputElement>(null);
  const effAtInputRef = useRef<HTMLInputElement>(null);
  const changeNoteInputRef = useRef<HTMLInputElement>(null);
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const automaticTitle = getDocumentTitleFromFile(initialFile);
      setCode('');
      setTitle(automaticTitle);
      setVersion('');
      setChangeNote('初版發行');
      setRevisionDate(getTodayString());
      setEffAt(getTodayString());
      setFile(initialFile);
      setSourceFile(null);
      setSecurityLevel(parentDocument?.security_level || 1);
      automaticTitleRef.current = automaticTitle;
      fileNameValidation.resetErrors({ title: automaticTitle });
    }
  }, [isOpen, initialFile, parentDocument]);

  const handleConfirm = async () => {
    if (!fileNameValidation.validateField('code', code)) {
      codeInputRef.current?.focus();
      return;
    }
    if (!title.trim()) {
      showRequiredFieldMessage('請輸入文件名稱。', titleInputRef.current);
      return;
    }
    if (!fileNameValidation.validateField('title', title)) {
      titleInputRef.current?.focus();
      return;
    }
    if (!fileNameValidation.validateField('version', version)) {
      versionInputRef.current?.focus();
      return;
    }
    if (!file) {
      showRequiredFieldMessage('請選擇文件檔案。', fileButtonRef.current);
      return;
    }
    if (!revisionDate) {
      showRequiredFieldMessage('請輸入修訂日期。', revisionDateInputRef.current);
      return;
    }
    if (!effAt) {
      showRequiredFieldMessage('請輸入生效日期。', effAtInputRef.current);
      return;
    }
    if (!changeNote.trim()) {
      showRequiredFieldMessage('請輸入異動說明。', changeNoteInputRef.current);
      return;
    }
    const success = await onCreate(
      code.trim(),
      title.trim(),
      version.trim(),
      changeNote.trim(),
      revisionDate,
      effAt,
      file,
      sourceFile,
      parentDocument ? undefined : securityLevel
    );
    if (success) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={parentDocument ? '新增相關文件' : '新增文件'}
      useNativeDialog
      closeOnOverlayClick={false}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleConfirm}>上傳建檔</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {parentDocument && (
          <div className="related-document-parent">
            <span>隸屬於</span>
            <strong>{[parentDocument.code, parentDocument.title].filter(Boolean).join(' ')}</strong>
            <span>繼承主文件機敏等級：{getSecurityLevelLabel(parentDocument.security_level)}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <div
            className="input-group"
            style={{ flex: parentDocument ? 1 : 2, minWidth: 0, marginBottom: 0 }}
          >
            <label>文件編號（選填）</label>
            <input
              ref={codeInputRef}
              value={code}
              maxLength={50}
              aria-invalid={Boolean(fileNameValidation.errors.code)}
              aria-describedby={fileNameValidation.errors.code ? 'new-document-code-error' : undefined}
              onChange={(e) => fileNameValidation.acceptChange('code', e.target.value, setCode, toUpperValue)}
              onBlur={() => fileNameValidation.validateField('code', code)}
              placeholder="可留空"
            />
            <FileNameValidationMessage id="new-document-code-error" message={fileNameValidation.errors.code} />
          </div>
          {!parentDocument && (
            <div className="input-group" style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
              <label>機敏等級</label>
              <select
                value={securityLevel}
                onChange={(event) => setSecurityLevel(Number(event.target.value) as DocumentSecurityLevel)}
              >
                {SECURITY_LEVEL_OPTIONS.map(option => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.value === 3 && !allowConfidential}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="input-group" style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
            <label>版本號</label>
            <input
              ref={versionInputRef}
              value={version}
              aria-invalid={Boolean(fileNameValidation.errors.version)}
              aria-describedby={fileNameValidation.errors.version ? 'new-document-version-error' : undefined}
              onChange={(e) => fileNameValidation.acceptChange('version', e.target.value, setVersion, toUpperValue)}
              onBlur={() => fileNameValidation.validateField('version', version)}
              placeholder="可留空"
            />
            <FileNameValidationMessage id="new-document-version-error" message={fileNameValidation.errors.version} />
          </div>
        </div>

        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>文件名稱</label>
          <input
            ref={titleInputRef}
            value={title}
            aria-invalid={Boolean(fileNameValidation.errors.title)}
            aria-describedby={fileNameValidation.errors.title ? 'new-document-title-error' : undefined}
            onChange={(e) => fileNameValidation.acceptChange('title', e.target.value, setTitle)}
            onBlur={() => fileNameValidation.validateField('title', title)}
            placeholder="研發部作業規範"
          />
          <FileNameValidationMessage id="new-document-title-error" message={fileNameValidation.errors.title} />
        </div>

        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>文件檔案</label>
          <button ref={fileButtonRef} type="button" className="btn btn-secondary btn-block" onClick={() => fileInputRef.current?.click()}>
            {file ? file.name : '選擇檔案'}
          </button>
          <input ref={fileInputRef} type="file" accept={ACCEPTED_DOCUMENT_FILE_TYPES} style={{ display: 'none' }} onChange={(e) => {
            const selected = e.target.files?.[0] || null;
            const previousAutomaticTitle = automaticTitleRef.current;
            const nextAutomaticTitle = getDocumentTitleFromFile(selected);
            setFile(selected);
            setTitle(currentTitle => (
              currentTitle === previousAutomaticTitle ? nextAutomaticTitle : currentTitle
            ));
            if (title === previousAutomaticTitle) {
              fileNameValidation.setFieldError('title', getWindowsFileNameValidationError(nextAutomaticTitle));
            }
            automaticTitleRef.current = nextAutomaticTitle;
            if (!isPdfFile(selected)) setSourceFile(null);
          }} />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>修訂日期</label>
            <input ref={revisionDateInputRef} type="date" value={revisionDate} onChange={(e) => setRevisionDate(e.target.value)} />
          </div>
          <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>生效日期</label>
            <input ref={effAtInputRef} type="date" value={effAt} min={getTodayString()} onChange={(e) => setEffAt(e.target.value)} />
          </div>
        </div>

        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>異動說明</label>
          <ChangeNoteInput
            selectId="document-change-note-options"
            value={changeNote}
            onChange={setChangeNote}
            inputRef={changeNoteInputRef}
          />
        </div>

        {isPdfFile(file) && (
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>PDF 原始編修檔案</label>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => sourceFileInputRef.current?.click()}>
              {sourceFile ? sourceFile.name : '選擇原始檔案'}
            </button>
            <input ref={sourceFileInputRef} type="file" accept={ACCEPTED_DOCUMENT_FILE_TYPES} style={{ display: 'none' }} onChange={(e) => setSourceFile(e.target.files?.[0] || null)} />
          </div>
        )}
      </div>
    </Modal>
  );
};

interface UploadVerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDoc: Document | null;
  initialFile: File | null;
  initialVersion?: string;
  onUpload: (
    docId: string,
    version: string,
    changeNote: string,
    revisionDate: string,
    effAt: string,
    file: File,
    sourceFile?: File | null
  ) => Promise<boolean>;
}

interface EditDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDoc: Document | null;
  canChangeSecurityLevel?: boolean;
  onSave: (
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
  ) => Promise<boolean>;
}

export const EditDocumentModal: React.FC<EditDocumentModalProps> = ({
  isOpen,
  onClose,
  targetDoc,
  canChangeSecurityLevel = false,
  onSave
}) => {
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [version, setVersion] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [revisionDate, setRevisionDate] = useState('');
  const [effAt, setEffAt] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [securityLevel, setSecurityLevel] = useState<DocumentSecurityLevel>(1);
  const fileNameValidation = useDocumentFileNameValidation();

  const versionInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const revisionDateInputRef = useRef<HTMLInputElement>(null);
  const effAtInputRef = useRef<HTMLInputElement>(null);
  const changeNoteInputRef = useRef<HTMLInputElement>(null);
  const sourceFileInputRef = useRef<HTMLInputElement>(null);
  const targetVersion = targetDoc?.versions.find(item => item.ver_id === targetDoc.ver_id);
  const isScheduledVersion = targetVersion?.status === 'Scheduled';

  useEffect(() => {
    if (!isOpen) return;
    setCode(targetDoc?.code || '');
    setTitle(targetDoc?.title || '');
    setVersion(targetDoc?.version || '');
    setChangeNote(targetDoc?.change_note || '');
    setRevisionDate(targetDoc?.revision_date || '');
    setEffAt(targetDoc?.effective_at?.split(' ')[0] || '');
    setSourceFile(null);
    setSecurityLevel(targetDoc?.security_level || 1);
    fileNameValidation.resetErrors(isScheduledVersion
      ? { version: targetDoc?.version || '' }
      : {
          code: targetDoc?.code || '',
          title: targetDoc?.title || '',
          version: targetDoc?.version || ''
        });
  }, [isOpen, targetDoc]);

  const handleConfirm = async () => {
    if (!targetDoc?.ver_id) return;
    if (!isScheduledVersion && !fileNameValidation.validateField('code', code)) {
      codeInputRef.current?.focus();
      return;
    }
    if (!isScheduledVersion && !title.trim()) {
      showRequiredFieldMessage('請輸入文件名稱。', titleInputRef.current);
      return;
    }
    if (!isScheduledVersion && !fileNameValidation.validateField('title', title)) {
      titleInputRef.current?.focus();
      return;
    }
    if (!fileNameValidation.validateField('version', version)) {
      versionInputRef.current?.focus();
      return;
    }
    if (!revisionDate) {
      showRequiredFieldMessage('請輸入修訂日期。', revisionDateInputRef.current);
      return;
    }
    if (!effAt) {
      showRequiredFieldMessage(
        isScheduledVersion ? '請輸入發行日期。' : '請輸入生效日期。',
        effAtInputRef.current
      );
      return;
    }
    if (!changeNote.trim()) {
      showRequiredFieldMessage('請輸入異動說明。', changeNoteInputRef.current);
      return;
    }

    const success = await onSave(
      targetDoc.id,
      targetDoc.ver_id,
      code.trim(),
      title.trim(),
      version.trim(),
      changeNote.trim(),
      revisionDate,
      effAt,
      sourceFile,
      targetDoc.parent_document_id || isScheduledVersion || !canChangeSecurityLevel
        ? undefined
        : securityLevel
    );
    if (success) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`修改文件：${targetDoc?.title || ''}`}
      useNativeDialog
      closeOnOverlayClick={false}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleConfirm}>儲存修改</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {isScheduledVersion ? (
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>新版本號</label>
            <input
              ref={versionInputRef}
              value={version}
              aria-invalid={Boolean(fileNameValidation.errors.version)}
              aria-describedby={fileNameValidation.errors.version ? 'edit-scheduled-version-error' : undefined}
              onChange={(e) => fileNameValidation.acceptChange('version', e.target.value, setVersion, toUpperValue)}
              onBlur={() => fileNameValidation.validateField('version', version)}
              placeholder="可留空"
            />
            <FileNameValidationMessage id="edit-scheduled-version-error" message={fileNameValidation.errors.version} />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12 }}>
              <div
                className="input-group"
                style={{ flex: targetDoc?.parent_document_id ? 1 : 2, minWidth: 0, marginBottom: 0 }}
              >
                <label>文件編號（選填）</label>
                <input
                  ref={codeInputRef}
                  value={code}
                  maxLength={50}
                  aria-invalid={Boolean(fileNameValidation.errors.code)}
                  aria-describedby={fileNameValidation.errors.code ? 'edit-document-code-error' : undefined}
                  onChange={(e) => fileNameValidation.acceptChange('code', e.target.value, setCode, toUpperValue)}
                  onBlur={() => fileNameValidation.validateField('code', code)}
                  placeholder="可留空"
                />
                <FileNameValidationMessage id="edit-document-code-error" message={fileNameValidation.errors.code} />
              </div>
              {!targetDoc?.parent_document_id && (canChangeSecurityLevel ? (
                <div className="input-group" style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
                  <label>機敏等級</label>
                  <select
                    value={securityLevel}
                    onChange={(event) => setSecurityLevel(Number(event.target.value) as DocumentSecurityLevel)}
                  >
                    {SECURITY_LEVEL_OPTIONS.map(option => (
                      <option
                        key={option.value}
                        value={option.value}
                        disabled={option.value === 3 && targetDoc?.folder_id === '0'}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="input-group" style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
                  <label>機敏等級</label>
                  <input
                    value={getSecurityLevelLabel(targetDoc?.security_level)}
                    readOnly
                  />
                </div>
              ))}
              <div className="input-group" style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
                <label>版本號</label>
                <input
                  ref={versionInputRef}
                  value={version}
                  aria-invalid={Boolean(fileNameValidation.errors.version)}
                  aria-describedby={fileNameValidation.errors.version ? 'edit-document-version-error' : undefined}
                  onChange={(e) => fileNameValidation.acceptChange('version', e.target.value, setVersion, toUpperValue)}
                  onBlur={() => fileNameValidation.validateField('version', version)}
                  placeholder="可留空"
                />
                <FileNameValidationMessage id="edit-document-version-error" message={fileNameValidation.errors.version} />
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: 0 }}>
              <label>文件名稱</label>
              <input
                ref={titleInputRef}
                value={title}
                aria-invalid={Boolean(fileNameValidation.errors.title)}
                aria-describedby={fileNameValidation.errors.title ? 'edit-document-title-error' : undefined}
                onChange={(e) => fileNameValidation.acceptChange('title', e.target.value, setTitle)}
                onBlur={() => fileNameValidation.validateField('title', title)}
              />
              <FileNameValidationMessage id="edit-document-title-error" message={fileNameValidation.errors.title} />
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>修訂日期</label>
            <input ref={revisionDateInputRef} type="date" value={revisionDate} onChange={(e) => setRevisionDate(e.target.value)} />
          </div>
          <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>{isScheduledVersion ? '發行日期' : '生效日期'}</label>
            <input ref={effAtInputRef} type="date" value={effAt} onChange={(e) => setEffAt(e.target.value)} />
          </div>
        </div>

        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>異動說明</label>
          <ChangeNoteInput
            selectId="edit-document-change-note-options"
            value={changeNote}
            onChange={setChangeNote}
            inputRef={changeNoteInputRef}
          />
        </div>

        {!isScheduledVersion && targetDoc?.is_pdf && (
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>PDF 原始編修檔案</label>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => sourceFileInputRef.current?.click()}>
              {sourceFile
                ? sourceFile.name
                : targetDoc.has_source_file
                  ? targetDoc.source_file_name || '選擇替換檔案'
                  : '選擇原始檔案'}
            </button>
            <input ref={sourceFileInputRef} type="file" accept={ACCEPTED_DOCUMENT_FILE_TYPES} style={{ display: 'none' }} onChange={(e) => setSourceFile(e.target.files?.[0] || null)} />
          </div>
        )}
      </div>
    </Modal>
  );
};

export const UploadVerModal: React.FC<UploadVerModalProps> = ({ isOpen, onClose, targetDoc, initialFile, initialVersion, onUpload }) => {
  const [version, setVersion] = useState('');
  const [changeNote, setChangeNote] = useState('內容修訂');
  const [revisionDate, setRevisionDate] = useState(getTodayString());
  const [effAt, setEffAt] = useState(getTodayString());
  const [file, setFile] = useState<File | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const fileNameValidation = useDocumentFileNameValidation();

  const versionInputRef = useRef<HTMLInputElement>(null);
  const revisionDateInputRef = useRef<HTMLInputElement>(null);
  const effAtInputRef = useRef<HTMLInputElement>(null);
  const changeNoteInputRef = useRef<HTMLInputElement>(null);
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setVersion(initialVersion ? toUpperValue(initialVersion) : '');
      setChangeNote('內容修訂');
      setRevisionDate(getTodayString());
      setEffAt(getTodayString());
      setFile(initialFile);
      setSourceFile(null);
      fileNameValidation.resetErrors({ version: initialVersion ? toUpperValue(initialVersion) : '' });
    }
  }, [isOpen, initialFile, initialVersion]);

  const handleConfirm = async () => {
    if (!targetDoc) return;
    if (!fileNameValidation.validateField('version', version)) {
      versionInputRef.current?.focus();
      return;
    }
    if (!file) {
      showRequiredFieldMessage('請選擇文件檔案。', fileButtonRef.current);
      return;
    }
    if (!revisionDate) {
      showRequiredFieldMessage('請輸入修訂日期。', revisionDateInputRef.current);
      return;
    }
    if (!effAt) {
      showRequiredFieldMessage('請輸入生效日期。', effAtInputRef.current);
      return;
    }
    if (!changeNote.trim()) {
      showRequiredFieldMessage('請輸入異動說明。', changeNoteInputRef.current);
      return;
    }
    const success = await onUpload(targetDoc.id, version.trim(), changeNote.trim(), revisionDate, effAt, file, sourceFile);
    if (success) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`文件版更：${targetDoc?.title || ''}`}
      useNativeDialog
      closeOnOverlayClick={false}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleConfirm}>建立新版</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>文件編號</label>
            <input value={targetDoc?.code || ''} readOnly />
          </div>
          <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>新版本號</label>
            <input
              ref={versionInputRef}
              value={version}
              aria-invalid={Boolean(fileNameValidation.errors.version)}
              aria-describedby={fileNameValidation.errors.version ? 'upload-version-error' : undefined}
              onChange={(e) => fileNameValidation.acceptChange('version', e.target.value, setVersion, toUpperValue)}
              onBlur={() => fileNameValidation.validateField('version', version)}
              placeholder="可留空"
            />
            <FileNameValidationMessage id="upload-version-error" message={fileNameValidation.errors.version} />
          </div>
        </div>

        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>文件名稱</label>
          <input value={targetDoc?.title || ''} readOnly />
        </div>

        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>文件檔案</label>
          <button ref={fileButtonRef} type="button" className="btn btn-secondary btn-block" onClick={() => fileInputRef.current?.click()}>
            {file ? file.name : '選擇新版檔案'}
          </button>
          <input ref={fileInputRef} type="file" accept={ACCEPTED_DOCUMENT_FILE_TYPES} style={{ display: 'none' }} onChange={(e) => {
            const selected = e.target.files?.[0] || null;
            setFile(selected);
            if (!isPdfFile(selected)) setSourceFile(null);
          }} />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>修訂日期</label>
            <input ref={revisionDateInputRef} type="date" value={revisionDate} onChange={(e) => setRevisionDate(e.target.value)} />
          </div>
          <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>生效日期</label>
            <input ref={effAtInputRef} type="date" value={effAt} min={getTodayString()} onChange={(e) => setEffAt(e.target.value)} />
          </div>
        </div>

        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>異動說明</label>
          <ChangeNoteInput
            selectId="upload-change-note-options"
            value={changeNote}
            onChange={setChangeNote}
            inputRef={changeNoteInputRef}
          />
        </div>

        {isPdfFile(file) && (
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>PDF 原始編修檔案</label>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => sourceFileInputRef.current?.click()}>
              {sourceFile ? sourceFile.name : '選擇原始檔案'}
            </button>
            <input ref={sourceFileInputRef} type="file" accept={ACCEPTED_DOCUMENT_FILE_TYPES} style={{ display: 'none' }} onChange={(e) => setSourceFile(e.target.files?.[0] || null)} />
          </div>
        )}
      </div>
    </Modal>
  );
};

interface ObsoleteDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  relatedDocumentCount?: number;
  onObsolete: (reason: string, file: File) => Promise<boolean>;
}

export const ObsoleteDocModal: React.FC<ObsoleteDocModalProps> = ({
  isOpen,
  onClose,
  targetName,
  relatedDocumentCount = 0,
  onObsolete
}) => {
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const reasonInputRef = useRef<HTMLInputElement>(null);
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setFile(null);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      showRequiredFieldMessage('請輸入廢止原因。', reasonInputRef.current);
      return;
    }
    if (!file) {
      showRequiredFieldMessage('請選擇廢止公文或核准文件。', fileButtonRef.current);
      return;
    }
    const success = await onObsolete(reason.trim(), file);
    if (success) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="手動廢止文件"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-danger" onClick={handleConfirm}>確認廢止</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p>
          您即將廢止文件「<strong>{targetName}</strong>」。
          {relatedDocumentCount > 0 && ` 系統會一併廢止底下 ${relatedDocumentCount} 份相關文件。`}
          手動廢止必須填寫原因並上傳核准文件。
        </p>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>廢止原因</label>
          <input ref={reasonInputRef} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：改由新文件取代" />
        </div>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>廢止公文或核准文件</label>
          <button ref={fileButtonRef} type="button" className="btn btn-secondary btn-block" onClick={() => fileInputRef.current?.click()}>
            {file ? file.name : '選擇檔案'}
          </button>
          <input ref={fileInputRef} type="file" accept={ACCEPTED_DOCUMENT_FILE_TYPES} style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
      </div>
    </Modal>
  );
};

interface DeleteDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  relatedDocumentCount?: number;
  totalVersionCount?: number;
  onDelete: () => Promise<boolean>;
}

interface MoveDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  sourceFolderPath: string;
  relatedDocumentCount?: number;
  destinations: Array<{ id: string; path: string }>;
  onMove: (destinationFolderId: string) => Promise<boolean>;
}

export const MoveDocumentModal: React.FC<MoveDocumentModalProps> = ({
  isOpen,
  onClose,
  targetName,
  sourceFolderPath,
  relatedDocumentCount = 0,
  destinations,
  onMove
}) => {
  const [destinationFolderId, setDestinationFolderId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const destinationRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (isOpen) {
      setDestinationFolderId('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!destinationFolderId) {
      showRequiredFieldMessage('請選擇目的資料夾。', destinationRef.current);
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await onMove(destinationFolderId);
      if (success) onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSubmitting ? () => undefined : onClose}
      title="移動文件"
      closeOnOverlayClick={!isSubmitting}
      footer={
        <>
          <button className="btn btn-secondary" disabled={isSubmitting} onClick={onClose}>取消</button>
          <button className="btn btn-primary" disabled={isSubmitting} onClick={handleConfirm}>
            {isSubmitting ? '移動中...' : '確認移動'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p>文件：<strong>{targetName}</strong></p>
        <p>來源：{sourceFolderPath}</p>
        {relatedDocumentCount > 0 && (
          <p>將連同 {relatedDocumentCount} 份相關文件整組移動。</p>
        )}
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="move-document-destination">目的資料夾</label>
          <select
            id="move-document-destination"
            ref={destinationRef}
            value={destinationFolderId}
            disabled={isSubmitting}
            onChange={(event) => setDestinationFolderId(event.target.value)}
          >
            <option value="">請選擇目的資料夾</option>
            {destinations.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.path}
              </option>
            ))}
          </select>
        </div>
        <p style={{ color: 'var(--color-warning)' }}>
          移動後，此文件將套用目的資料夾的權限設定。原本可查看文件的使用者可能會失去權限，也可能有其他使用者取得查看權限。
        </p>
      </div>
    </Modal>
  );
};

export const DeleteDocModal: React.FC<DeleteDocModalProps> = ({
  isOpen,
  onClose,
  targetName,
  relatedDocumentCount = 0,
  totalVersionCount = 1,
  onDelete
}) => {
  const handleConfirm = async () => {
    const success = await onDelete();
    if (success) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="刪除文件"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-danger" onClick={handleConfirm}>確認刪除</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {relatedDocumentCount > 0 ? (
          <p>
            您即將強制刪除主文件「<strong>{targetName}</strong>」、底下 {relatedDocumentCount} 份相關文件，
            共 {totalVersionCount} 筆版本。文件主檔及全部版本會移除，系統只保留稽核紀錄。
          </p>
        ) : (
          <p>您即將刪除第一版文件「<strong>{targetName}</strong>」。刪除後文件主檔與第一版紀錄會移除，系統會保留稽核紀錄。</p>
        )}
      </div>
    </Modal>
  );
};

interface DeleteScheduledVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  targetVersion: string;
  effectiveAt: string;
  onDelete: () => Promise<boolean>;
}

export const DeleteScheduledVersionModal: React.FC<DeleteScheduledVersionModalProps> = ({
  isOpen,
  onClose,
  targetName,
  targetVersion,
  effectiveAt,
  onDelete
}) => {
  const handleConfirm = async () => {
    const success = await onDelete();
    if (success) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="刪除預約版本"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-danger" onClick={handleConfirm}>確認刪除</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p>
          您即將刪除文件「<strong>{targetName}</strong>」的預約版本
          {targetVersion ? `「${targetVersion}」` : ''}。
        </p>
        <p>發行日期：{effectiveAt?.split(' ')[0] || '-'}</p>
        <p>刪除後，目前有效版本會繼續生效；此操作無法復原。</p>
      </div>
    </Modal>
  );
};

interface CancelVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  onCancelVersion: (reason: string) => Promise<boolean>;
}

export const CancelVersionModal: React.FC<CancelVersionModalProps> = ({ isOpen, onClose, targetName, onCancelVersion }) => {
  const [reason, setReason] = useState('');
  const reasonInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      showRequiredFieldMessage('請輸入撤回原因。', reasonInputRef.current);
      return;
    }
    const success = await onCancelVersion(reason.trim());
    if (success) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="撤回最新版本"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-danger" onClick={handleConfirm}>撤回並回復前版</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p>您即將撤回「<strong>{targetName}</strong>」的最新版本，系統會清空前一版的結束時間。</p>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>撤回原因</label>
          <input ref={reasonInputRef} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="請輸入撤回原因" />
        </div>
      </div>
    </Modal>
  );
};

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyDoc: Document | null;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, historyDoc }) => {
  if (!historyDoc) return null;

  const getBadge = (status: string) => {
    if (status === 'Effective') return { text: '生效中', color: 'var(--color-success)' };
    if (status === 'Scheduled') return { text: '預約生效', color: 'var(--accent-cyan)' };
    if (status === 'Cancelled') return { text: '已撤回', color: 'var(--color-danger)' };
    if (status === 'History') return { text: '歷史版本', color: 'var(--text-muted)' };
    return { text: '已廢止', color: 'var(--color-danger)' };
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`版本歷史：${historyDoc.title}`}
      footer={<button className="btn btn-primary" onClick={onClose}>關閉</button>}
      contentClassName="modal-content-history"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {historyDoc.status === 'Obsolete' && (
          <div style={{ backgroundColor: 'hsla(355, 85%, 55%, 0.12)', border: '1px solid hsla(355, 85%, 55%, 0.3)', borderRadius: 'var(--radius-sm)', padding: 16 }}>
            <h4 style={{ color: 'var(--color-danger)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ErrorOutlineIcon size={20} />
              本文件已廢止
            </h4>
            <p><strong>廢止原因：</strong>{historyDoc.obsolete_reason || '無紀錄'}</p>
          </div>
        )}

        <div className="version-history-table-wrap">
          <table className="version-history-table">
            <colgroup>
              <col style={{ width: '9%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '28%' }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-secondary)' }}>
                <th>版本</th>
                <th>狀態</th>
                <th>修訂日期</th>
                <th className="access-count-column">點閱次數</th>
                <th>生效日期</th>
                <th>結束日期</th>
                <th>異動說明</th>
              </tr>
            </thead>
            <tbody>
              {historyDoc.versions?.map(v => {
                const badge = getBadge(v.status);
                return (
                  <tr key={v.ver_id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ fontWeight: 600 }} data-tooltip={v.ver_number || `第 ${v.seq} 版`}>{v.ver_number || `第 ${v.seq} 版`}</td>
                    <td data-tooltip={badge.text}><span className="badge" style={{ color: badge.color }}>{badge.text}</span></td>
                    <td data-tooltip={v.revision_date || '-'}>{v.revision_date || '-'}</td>
                    <td className="access-count-column">{v.access_count.toLocaleString('zh-TW')}</td>
                    <td data-tooltip={v.effective_at?.split(' ')[0] || '-'}>{v.effective_at?.split(' ')[0] || '-'}</td>
                    <td data-tooltip={v.effective_until ? v.effective_until.split(' ')[0] : '-'}>{v.effective_until ? v.effective_until.split(' ')[0] : '-'}</td>
                    <td data-tooltip={v.change_note || v.cancel_reason || '-'}>{v.change_note || v.cancel_reason || '-'}</td>
                  </tr>
                );
              })}
              {(!historyDoc.versions || historyDoc.versions.length === 0) && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>此文件尚無版本歷史。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </Modal>
  );
};
