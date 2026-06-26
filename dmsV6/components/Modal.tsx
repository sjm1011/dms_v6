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
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer,
  closeOnOverlayClick = true,
  contentClassName = '',
  useNativeDialog = false
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

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
    <div className={`modal-content ${contentClassName}`.trim()} onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h3>{title}</h3>
        <button className="close-btn" onClick={onClose}>&times;</button>
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
