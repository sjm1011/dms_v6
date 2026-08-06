import React from 'react';

type DocumentIconKind = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'image' | 'document';
type DocumentIconSize = 18 | 24;

export interface DocumentIconSource {
  file_name?: string;
  ext?: string;
  mime?: string;
  is_pdf?: boolean;
}

const DOCUMENT_ICON_KIND_BY_EXTENSION: Record<string, DocumentIconKind> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  xls: 'excel',
  xlsx: 'excel',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  tif: 'image',
  tiff: 'image',
  webp: 'image'
};

const getDocumentIconKind = (item: DocumentIconSource): DocumentIconKind => {
  const extension = (
    item.ext?.replace(/^\.+/, '')
    || item.file_name?.match(/\.([^.]+)$/)?.[1]
    || ''
  ).toLowerCase();
  if (extension && DOCUMENT_ICON_KIND_BY_EXTENSION[extension]) {
    return DOCUMENT_ICON_KIND_BY_EXTENSION[extension];
  }

  const mime = item.mime?.split(';', 1)[0].trim().toLowerCase() || '';
  if (mime === 'application/pdf' || item.is_pdf) return 'pdf';
  if (mime === 'application/msword' || mime.includes('wordprocessingml')) return 'word';
  if (mime === 'application/vnd.ms-excel' || mime.includes('spreadsheetml')) return 'excel';
  if (mime === 'application/vnd.ms-powerpoint' || mime.includes('presentationml')) return 'powerpoint';
  if (mime.startsWith('image/')) return 'image';

  return 'document';
};

export const DocumentTypeIcon = ({ item, size }: { item: DocumentIconSource; size: DocumentIconSize }) => {
  const iconKind = getDocumentIconKind(item);

  return (
    <img
      className="document-type-icon"
      src={`/icons/document-icons/generated/${iconKind}-${size}.png`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
};
