import { Document, ApiResponse } from '../types';
import { API_BASE, apiFetch, getAuthHeader, handleResponse } from './client';

interface UploadFilePayload {
  name: string;
  mime: string;
  base64: string;
}

const fileToPayload = async (file: File): Promise<UploadFilePayload> => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return {
    name: file.name,
    mime: file.type || 'application/octet-stream',
    base64: btoa(binary)
  };
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toScriptString = (value: string) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const sanitizeDownloadFileName = (value: string) =>
  value
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

const ensurePdfExtension = (fileName: string) =>
  fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;

const buildPreviewPdfFileName = (documentName = 'document', revisionDate?: string) => {
  const safeName = sanitizeDownloadFileName(documentName) || 'document';
  const safeRevisionDate = sanitizeDownloadFileName(revisionDate && revisionDate !== '-' ? revisionDate : '');
  const baseName = safeRevisionDate ? `${safeName}_${safeRevisionDate}` : safeName;
  return ensurePdfExtension(baseName);
};

const writePreviewLoading = (previewWindow: Window | null) => {
  if (!previewWindow) return;

  previewWindow.document.write(`
    <!doctype html>
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8" />
        <title>PDF 預覽</title>
        <style>
          html, body {
            margin: 0;
            height: 100%;
            display: grid;
            place-items: center;
            background: #111827;
            color: #e5e7eb;
            font: 600 16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
        </style>
      </head>
      <body>文件預覽載入中...</body>
    </html>
  `);
  previewWindow.document.close();
};

const openPdfPreview = (objectUrl: string, fileName: string, targetWindow?: Window | null) => {
  const previewWindow = targetWindow || window.open('', '_blank');
  const previewUrl = `${objectUrl}#page=1&toolbar=0&navpanes=0`;
  const objectUrlScriptValue = toScriptString(objectUrl);
  const fileNameScriptValue = toScriptString(fileName);

  if (!previewWindow || previewWindow.closed) {
    window.open(previewUrl, '_blank');
    return null;
  }

  previewWindow.document.write(`
    <!doctype html>
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8" />
        <title>PDF 預覽</title>
        <style>
          html, body { margin: 0; height: 100%; overflow: hidden; background: #111827; }
          body { display: flex; flex-direction: column; }
          .preview-toolbar {
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 12px;
            padding: 0 16px;
            background: #111827;
            color: #e5e7eb;
            font: 600 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .preview-toolbar .zoom-hint {
            margin-right: auto;
            color: #cbd5e1;
            font-weight: 500;
          }
          .preview-toolbar button {
            color: #ffffff;
            background: #2563eb;
            border: 0;
            border-radius: 6px;
            cursor: pointer;
            font: inherit;
            padding: 8px 12px;
          }
          .preview-toolbar .secondary-button {
            background: #374151;
          }
          .preview-toolbar button:disabled {
            cursor: wait;
            opacity: 0.72;
          }
          iframe {
            width: 100%;
            flex: 1;
            border: 0;
          }
        </style>
      </head>
      <body>
        <div class="preview-toolbar">
          <span class="zoom-hint">縮放：Ctrl + 滑鼠滾輪</span>
          <button id="printPdfButton" class="secondary-button" type="button">列印</button>
          <button id="downloadPdfButton" type="button">下載 PDF</button>
        </div>
        <iframe id="pdfPreviewFrame" src="${escapeHtml(previewUrl)}" title="PDF 預覽"></iframe>
        <script>
          (() => {
            const objectUrl = ${objectUrlScriptValue};
            const fileName = ${fileNameScriptValue};
            const downloadButton = document.getElementById('downloadPdfButton');
            const printButton = document.getElementById('printPdfButton');
            const previewFrame = document.getElementById('pdfPreviewFrame');

            const printPdf = () => {
              const frameWindow = previewFrame.contentWindow;
              if (!frameWindow) {
                return;
              }

              frameWindow.focus();
              frameWindow.print();
            };

            const downloadWithBrowserFallback = (blob) => {
              const fallbackUrl = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = fallbackUrl;
              link.download = fileName;
              document.body.appendChild(link);
              link.click();
              link.remove();
              URL.revokeObjectURL(fallbackUrl);
            };

            const savePdf = async () => {
              downloadButton.disabled = true;
              try {
                const response = await fetch(objectUrl);
                const blob = await response.blob();

                if (window.showSaveFilePicker) {
                  try {
                    const fileHandle = await window.showSaveFilePicker({
                      suggestedName: fileName,
                      types: [
                        {
                          description: 'PDF 文件',
                          accept: { 'application/pdf': ['.pdf'] }
                        }
                      ]
                    });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    return;
                  } catch (error) {
                    if (error && error.name === 'AbortError') {
                      return;
                    }
                    console.error(error);
                  }
                }

                downloadWithBrowserFallback(blob);
              } finally {
                downloadButton.disabled = false;
              }
            };

            printButton.addEventListener('click', printPdf);
            downloadButton.addEventListener('click', savePdf);
          })();
        </script>
      </body>
    </html>
  `);
  previewWindow.document.close();
  return previewWindow;
};

const openInlinePreview = (objectUrl: string, title: string, targetWindow?: Window | null) => {
  const previewWindow = targetWindow || window.open('', '_blank');

  if (!previewWindow || previewWindow.closed) {
    window.open(objectUrl, '_blank');
    return;
  }

  previewWindow.document.write(`
    <!doctype html>
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          html, body { margin: 0; height: 100%; overflow: hidden; background: #ffffff; }
          iframe { width: 100%; height: 100%; border: 0; background: #ffffff; }
        </style>
      </head>
      <body>
        <iframe sandbox="" referrerpolicy="no-referrer" src="${escapeHtml(objectUrl)}" title="${escapeHtml(title)}"></iframe>
      </body>
    </html>
  `);
  previewWindow.document.close();
};

const downloadBlob = async (
  url: string,
  fallbackFileName: string,
  inline: boolean,
  previewWindow?: Window | null
) => {
  const response = await fetch(url, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    throw new Error(payload.error || '文件存取失敗');
  }

  const blob = await response.blob();
  const isPdf = contentType.toLowerCase().includes('application/pdf');
  const objectBlob = inline && isPdf
    ? new File([blob], fallbackFileName, { type: 'application/pdf' })
    : blob;
  const objectUrl = URL.createObjectURL(objectBlob);

  if (inline) {
    if (isPdf) {
      const openedPreviewWindow = openPdfPreview(objectUrl, fallbackFileName, previewWindow);
      openedPreviewWindow?.addEventListener('beforeunload', () => URL.revokeObjectURL(objectUrl), { once: true });
    } else {
      openInlinePreview(objectUrl, '文件預覽', previewWindow);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
    return;
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);
  const fileName = match?.[1] || fallbackFileName;
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};

export const DocumentsAPI = {
  getDocuments: async (folderId: string, signal?: AbortSignal): Promise<ApiResponse<Document[]>> => {
    const response = await apiFetch(`${API_BASE}/documents?folder_id=${encodeURIComponent(folderId)}`, {
      signal,
      headers: getAuthHeader()
    });
    return await handleResponse(response);
  },

  createDocument: async (
    folderId: string,
    code: string,
    title: string,
    version: string,
    changeNote: string,
    revisionDate: string,
    effectiveAt: string,
    file: File,
    sourceFile?: File | null
  ): Promise<ApiResponse<Document>> => {
    const body: Record<string, unknown> = {
      action: 'create',
      folder_id: folderId,
      code,
      title,
      version,
      change_note: changeNote,
      revision_date: revisionDate,
      effective_at: effectiveAt,
      file: await fileToPayload(file)
    };

    if (sourceFile) {
      body.source_file = await fileToPayload(sourceFile);
    }

    const response = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(body)
    });
    return await handleResponse(response);
  },

  uploadVersion: async (
    docId: string,
    version: string,
    changeNote: string,
    revisionDate: string,
    effectiveAt: string,
    file: File,
    sourceFile?: File | null
  ): Promise<ApiResponse<null>> => {
    const body: Record<string, unknown> = {
      action: 'upload_version',
      doc_id: docId,
      version,
      change_note: changeNote,
      revision_date: revisionDate,
      effective_at: effectiveAt,
      file: await fileToPayload(file)
    };

    if (sourceFile) {
      body.source_file = await fileToPayload(sourceFile);
    }

    const response = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(body)
    });
    return await handleResponse(response);
  },

  cancelLatestVersion: async (docId: string, reason: string): Promise<ApiResponse<null>> => {
    const response = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        action: 'cancel_latest_version',
        doc_id: docId,
        reason
      })
    });
    return await handleResponse(response);
  },

  obsoleteDocument: async (docId: string, reason: string, file: File): Promise<ApiResponse<null>> => {
    const response = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        action: 'obsolete',
        doc_id: docId,
        reason,
        file: await fileToPayload(file)
      })
    });
    return await handleResponse(response);
  },

  deleteDocument: async (docId: string): Promise<ApiResponse<null>> => {
    const response = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        action: 'delete_document',
        doc_id: docId
      })
    });
    return await handleResponse(response);
  },

  downloadVersion: async (versionId: string, fileName = 'document'): Promise<void> => {
    await downloadBlob(`${API_BASE}/documents/download?version_id=${encodeURIComponent(versionId)}`, fileName, false);
  },

  previewVersion: async (
    versionId: string,
    documentName?: string,
    revisionDate?: string
  ): Promise<void> => {
    const previewWindow = window.open('', '_blank');
    writePreviewLoading(previewWindow);

    try {
      const fileName = buildPreviewPdfFileName(documentName, revisionDate);
      await downloadBlob(`${API_BASE}/documents/preview?version_id=${encodeURIComponent(versionId)}`, fileName, true, previewWindow);
    } catch (err) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }
      throw err;
    }
  }
};
