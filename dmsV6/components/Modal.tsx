import React, { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  closeOnOverlayClick?: boolean;
  contentClassName?: string;
  useNativeDialog?: boolean;
  showCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer,
  closeOnOverlayClick = true,
  contentClassName = '',
  useNativeDialog = false,
  showCloseButton = true
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const getEditableInputs = () => {
    if (!contentRef.current) return [];

    return Array.from(
      contentRef.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
      )
    ).filter(element =>
      !element.disabled &&
      (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) || !element.readOnly) &&
      element.getClientRects().length > 0
    );
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;

    const target = event.target;
    if (!(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement) &&
        !(target instanceof HTMLSelectElement)) return;

    const inputs = getEditableInputs();
    const currentIndex = inputs.indexOf(target);
    if (currentIndex < 0) return;

    event.preventDefault();
    event.stopPropagation();

    if (target.dataset.enterAction === 'blur-or-submit') {
      if (target.value.trim() !== '') {
        target.blur();
        return;
      }

      const defaultButton = contentRef.current?.querySelector<HTMLButtonElement>(
        '.modal-footer .btn-primary:not(:disabled), .modal-footer .btn-danger:not(:disabled)'
      );
      defaultButton?.click();
      return;
    }

    const nextInput = inputs[currentIndex + 1];
    if (nextInput) {
      nextInput.focus();
      return;
    }

    const defaultButton = contentRef.current?.querySelector<HTMLButtonElement>(
      '.modal-footer .btn-primary:not(:disabled), .modal-footer .btn-danger:not(:disabled)'
    );
    defaultButton?.click();
  };

  useEffect(() => {
    if (!isOpen) return;

    const focusTimer = window.setTimeout(() => {
      getEditableInputs()[0]?.focus();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [isOpen]);

  useEffect(() => {
    if (!useNativeDialog) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.setAttribute('closedby', closeOnOverlayClick ? 'any' : 'closerequest');

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen, useNativeDialog, closeOnOverlayClick]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      ref={contentRef}
      className={`modal-content ${contentClassName}`.trim()}
      onClick={(e) => e.stopPropagation()}
      onKeyDownCapture={handleInputKeyDown}
    >
      <div className="modal-header">
        <h3>{title}</h3>
        {showCloseButton && <button className="close-btn" onClick={onClose}>&times;</button>}
      </div>
      <div className="modal-body">
        {children}
      </div>
      <div className="modal-footer">
        {footer}
      </div>
    </div>
  );

  if (useNativeDialog) {
    return (
      <dialog
        ref={dialogRef}
        className="modal show native-dialog"
        onCancel={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onClick={(e) => {
          if (closeOnOverlayClick && e.target === e.currentTarget) onClose();
        }}
      >
        {modalContent}
      </dialog>
    );
  }

  return (
    <div className="modal show" onClick={closeOnOverlayClick ? onClose : undefined}>
      {modalContent}
    </div>
  );
};
