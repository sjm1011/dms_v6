const fs = require('fs');
const path = require('path');

const DOCS_DIR = __dirname;

// Markdown 轉換為 HTML 渲染核心方法 (零依賴)
function markdownToHtml(md, title = '文件') {
  const lines = md.split('\n');
  let html = '';
  let inCode = false;
  let codeLang = '';
  let codeBlock = [];
  let inTable = false;
  let tableHeader = true;
  let tableRows = [];
  let inDdlSection = false;
  let ddlHeadingLevel = 0;

  const listStack = []; // 元素格式：{ indent: number, type: 'ul'|'ol', hasOpenLi: boolean }

  function closeListsTo(targetIndent) {
    let closedHtml = '';
    while (listStack.length > 0 && listStack[listStack.length - 1].indent > targetIndent) {
      const top = listStack.pop();
      if (top.hasOpenLi) {
        closedHtml += '</li>\n';
      }
      closedHtml += `</${top.type}>\n`;
      if (listStack.length > 0) {
        listStack[listStack.length - 1].hasOpenLi = true;
      }
    }
    return closedHtml;
  }

  function closeAllLists() {
    let closedHtml = '';
    while (listStack.length > 0) {
      const top = listStack.pop();
      if (top.hasOpenLi) {
        closedHtml += '</li>\n';
      }
      closedHtml += `</${top.type}>\n`;
    }
    return closedHtml;
  }

  // 輔助函式：解析行內 HTML 標記
  function parseInline(text) {
    let safe = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // 粗體 **text**
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 行內程式碼 `code`
    safe = safe.replace(/`(.*?)`/g, '<code>$1</code>');
    // 連結 [text](url)
    safe = safe.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
    
    return safe;
  }

  // 產生程式碼區塊。若位於 DDL 區段，額外加上複製按鈕。
  function renderCodeBlock(codeText, lang, isDdlCode) {
    const safeLang = lang.replace(/[^a-zA-Z0-9_-]/g, '');
    const codeHtml = `<pre><code class="language-${safeLang}">${codeText}</code></pre>`;

    if (!isDdlCode) {
      return `${codeHtml}\n`;
    }

    return `<div class="ddl-code-block">
  <button type="button" class="copy-ddl-btn" data-copy-label="複製 DDL" data-copied-label="已複製">複製 DDL</button>
  ${codeHtml}
</div>\n`;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. 程式碼區塊
    if (trimmed.startsWith('```')) {
      if (inCode) {
        const codeText = codeBlock.join('\n')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        html += renderCodeBlock(codeText, codeLang, inDdlSection);
        codeBlock = [];
        inCode = false;
      } else {
        html += closeAllLists();
        inCode = true;
        codeLang = trimmed.substring(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeBlock.push(line);
      continue;
    }

    // 2. 表格解析
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (trimmed.replace(/[\s|:-]/g, '') === '') {
        continue;
      }

      html += closeAllLists();

      const cells = trimmed.substring(1, trimmed.length - 1).split('|').map(c => c.trim());
      
      if (!inTable) {
        inTable = true;
        tableHeader = true;
        tableRows = [];
      }

      if (tableHeader) {
        const ths = cells.map(c => `<th>${parseInline(c)}</th>`).join('');
        tableRows.push(`  <thead>\n    <tr>${ths}</tr>\n  </thead>\n  <tbody>`);
        tableHeader = false;
      } else {
        const tds = cells.map(c => `<td>${parseInline(c)}</td>`).join('');
        tableRows.push(`    <tr>${tds}</tr>`);
      }
      continue;
    } else {
      if (inTable) {
        html += `<table>\n${tableRows.join('\n')}\n  </tbody>\n</table>\n`;
        inTable = false;
      }
    }

    // 3. 標題解析
    if (trimmed.startsWith('#')) {
      html += closeAllLists();
      
      const level = trimmed.match(/^#+/)[0].length;
      const text = trimmed.substring(level).trim();
      if (inDdlSection && level <= ddlHeadingLevel) {
        inDdlSection = false;
        ddlHeadingLevel = 0;
      }
      if (/ddl|註解|comment/i.test(text)) {
        inDdlSection = true;
        ddlHeadingLevel = level;
      }
      html += `<h${level}>${parseInline(text)}</h${level}>\n`;
      continue;
    }

    // 4. 清單解析
    const listMatch = line.match(/^(\s*)([*+-]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const marker = listMatch[2];
      const text = listMatch[3];
      const type = (marker === '*' || marker === '-' || marker === '+') ? 'ul' : 'ol';

      html += closeListsTo(indent);

      if (listStack.length > 0) {
        const top = listStack[listStack.length - 1];
        if (top.indent === indent && top.type === type) {
          if (top.hasOpenLi) {
            html += '</li>\n';
          }
          html += `  <li>${parseInline(text)}`;
          top.hasOpenLi = true;
        } else if (top.indent === indent && top.type !== type) {
          html += closeListsTo(indent - 1);
          html += `<${type}>\n  <li>${parseInline(text)}`;
          listStack.push({ indent, type, hasOpenLi: true });
        } else {
          html += `\n<${type}>\n  <li>${parseInline(text)}`;
          listStack.push({ indent, type, hasOpenLi: true });
        }
      } else {
        html += `<${type}>\n  <li>${parseInline(text)}`;
        listStack.push({ indent, type, hasOpenLi: true });
      }
      continue;
    } else {
      html += closeAllLists();
    }

    // 5. 空行與段落
    if (trimmed === '') {
      continue;
    }

    html += `<p>${parseInline(trimmed)}</p>\n`;
  }

  if (inTable) {
    html += `<table>\n${tableRows.join('\n')}\n  </tbody>\n</table>\n`;
  }
  html += closeAllLists();

  // 美化 CSS 套件 (Premium 毛玻璃與暗色高質感主題)
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #121318;
      --bg-card: rgba(255, 255, 255, 0.03);
      --glass-border: rgba(255, 255, 255, 0.08);
      --text-primary: #e2e8f0;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent-color: #6366f1;
      --accent-hover: #4f46e5;
      --code-bg: #1e1e24;
      --radius-lg: 12px;
      --radius-sm: 6px;
    }

    body {
      background-color: var(--bg-primary);
      color: var(--text-primary);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 40px 20px;
    }

    .container {
      max-width: 850px;
      margin: 0 auto;
      background: var(--bg-card);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      padding: 40px;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    h1, h2, h3, h4 {
      color: #ffffff;
      font-weight: 600;
      margin-top: 1.8em;
      margin-bottom: 0.8em;
      line-height: 1.3;
    }

    h1 {
      font-size: 2.2rem;
      margin-top: 0;
      border-bottom: 2px solid var(--glass-border);
      padding-bottom: 12px;
    }

    h2 {
      font-size: 1.6rem;
      border-bottom: 1px solid var(--glass-border);
      padding-bottom: 8px;
    }

    h3 {
      font-size: 1.25rem;
    }

    p {
      margin-top: 0;
      margin-bottom: 1.2em;
      color: var(--text-primary);
      font-size: 1.05rem;
    }

    a {
      color: var(--accent-color);
      text-decoration: none;
      transition: color 0.2s ease;
      border-bottom: 1px dashed var(--accent-color);
    }

    a:hover {
      color: var(--accent-hover);
      border-bottom-style: solid;
    }

    ul {
      margin-top: 0;
      margin-bottom: 1.5em;
      padding-left: 24px;
    }

    li {
      margin-bottom: 0.5em;
      color: var(--text-primary);
    }

    code {
      font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
      font-size: 0.9em;
      background-color: var(--code-bg);
      padding: 3px 6px;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(255, 255, 255, 0.05);
      color: #ff79c6;
    }

    pre {
      background-color: var(--code-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-sm);
      padding: 16px;
      overflow-x: auto;
      margin-bottom: 1.5em;
    }

    pre code {
      background-color: transparent;
      padding: 0;
      border-radius: 0;
      border: none;
      color: #f8f8f2;
    }

    .ddl-code-block {
      position: relative;
      margin-bottom: 1.5em;
    }

    .ddl-code-block pre {
      margin-bottom: 0;
      padding-top: 48px;
    }

    .copy-ddl-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1;
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-primary);
      cursor: pointer;
      font-family: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      line-height: 1;
      padding: 8px 10px;
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
    }

    .copy-ddl-btn:hover {
      background: rgba(99, 102, 241, 0.18);
      border-color: rgba(99, 102, 241, 0.45);
      color: #ffffff;
    }

    .copy-ddl-btn.copied {
      background: rgba(34, 197, 94, 0.14);
      border-color: rgba(34, 197, 94, 0.45);
      color: #bbf7d0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 2em;
      border-radius: var(--radius-sm);
      overflow: hidden;
      border: 1px solid var(--glass-border);
    }

    th, td {
      padding: 12px 16px;
      text-align: left;
    }

    th {
      background-color: rgba(255, 255, 255, 0.05);
      color: #ffffff;
      font-weight: 600;
      border-bottom: 2px solid var(--glass-border);
    }

    td {
      border-bottom: 1px solid var(--glass-border);
      color: var(--text-secondary);
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background-color: rgba(255, 255, 255, 0.01);
      color: var(--text-primary);
    }

    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 0.85rem;
      color: var(--text-muted);
      border-top: 1px solid var(--glass-border);
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    ${html}
    <div class="footer">
      本文件由系統自動將 Markdown 轉換生成 &copy; ${new Date().getFullYear()} DMS V5 文件系統
    </div>
  </div>
  <script>
    function copyText(text) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand('copy');
        return Promise.resolve();
      } catch (err) {
        return Promise.reject(err);
      } finally {
        document.body.removeChild(textarea);
      }
    }

    document.querySelectorAll('.copy-ddl-btn').forEach(button => {
      button.addEventListener('click', () => {
        const code = button.closest('.ddl-code-block')?.querySelector('code');
        if (!code) return;

        copyText(code.textContent).then(() => {
          const copyLabel = button.dataset.copyLabel || '複製 DDL';
          const copiedLabel = button.dataset.copiedLabel || '已複製';
          button.textContent = copiedLabel;
          button.classList.add('copied');

          window.setTimeout(() => {
            button.textContent = copyLabel;
            button.classList.remove('copied');
          }, 1600);
        }).catch(() => {
          button.textContent = '複製失敗';
        });
      });
    });
  </script>
</body>
</html>`;
}

// 執行單一檔案轉換
function convertFile(filePath, updateIndex = false) {
  const ext = path.extname(filePath);
  if (ext.toLowerCase() !== '.md') return;

  const baseName = path.basename(filePath, ext);
  const outPath = path.join(DOCS_DIR, `${baseName}.html`);

  try {
    const mdContent = fs.readFileSync(filePath, 'utf-8');
    const htmlContent = markdownToHtml(mdContent, baseName);
    fs.writeFileSync(outPath, htmlContent, 'utf-8');
    console.log(`[同步成功] ${baseName}.md => ${baseName}.html`);
    if (updateIndex) {
      generateIndexHtml();
    }
  } catch (err) {
    console.error(`[同步失敗] 無法轉換檔案 ${baseName}.md:`, err.message);
  }
}

// 生成首頁索引 index.html
function generateIndexHtml() {
  const indexOutPath = path.join(DOCS_DIR, 'index.html');
  try {
    const files = fs.readdirSync(DOCS_DIR);
    const documents = [];

    files.forEach(file => {
      if (path.extname(file).toLowerCase() === '.md') {
        const fullPath = path.join(DOCS_DIR, file);
        const baseName = path.basename(file, '.md');
        let title = baseName;
        
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // 嘗試抓取第一個 # 標題
          const match = content.match(/^#\s+(.+)$/m);
          if (match && match[1]) {
            title = match[1].trim();
          }
        } catch (e) {
          // 讀取失敗則使用檔名
        }

        documents.push({
          fileName: `${baseName}.html`,
          title: title,
          mdName: file
        });
      }
    });

    // 優先將 system_specifications.md 放在第一個，其餘依照標題排序
    documents.sort((a, b) => {
      if (a.mdName === 'system_specifications.md') return -1;
      if (b.mdName === 'system_specifications.md') return 1;
      return a.title.localeCompare(b.title, 'zh-TW');
    });

    const listHtml = documents.map(doc => `
      <a href="${doc.fileName}" class="doc-card">
        <div class="doc-info">
          <div class="doc-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div class="doc-text">
            <div class="doc-title">${doc.title}</div>
            <div class="doc-meta">來源檔案: ${doc.mdName}</div>
          </div>
        </div>
        <div class="doc-arrow">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </a>
    `).join('\n');

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>參考文件索引</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0f1015;
      --bg-card: rgba(255, 255, 255, 0.02);
      --glass-border: rgba(255, 255, 255, 0.08);
      --glass-border-hover: rgba(255, 255, 255, 0.18);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #475569;
      --accent-color: #6366f1;
      --accent-glow: rgba(99, 102, 241, 0.15);
      --radius-lg: 16px;
      --radius-md: 12px;
      --radius-sm: 8px;
    }

    body {
      background-color: var(--bg-primary);
      color: var(--text-primary);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      margin: 0;
      padding: 60px 20px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.05) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(168, 85, 247, 0.05) 0%, transparent 40%);
    }

    .container {
      width: 100%;
      max-width: 800px;
    }

    header {
      margin-bottom: 40px;
      text-align: center;
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin: 0 0 10px 0;
      letter-spacing: -0.025em;
      background: linear-gradient(to right, #ffffff, #94a3b8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      color: var(--text-secondary);
      font-size: 1.1rem;
      font-weight: 400;
    }

    .doc-list {
      display: grid;
      gap: 16px;
      margin-bottom: 40px;
    }

    .doc-card {
      background: var(--bg-card);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-md);
      padding: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      text-decoration: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .doc-card:hover {
      border-color: var(--glass-border-hover);
      background: rgba(255, 255, 255, 0.05);
      transform: translateY(-2px);
      box-shadow: 0 12px 20px -10px var(--accent-glow);
    }

    .doc-info {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .doc-icon {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-sm);
      background: rgba(99, 102, 241, 0.1);
      border: 1px solid rgba(99, 102, 241, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent-color);
      transition: all 0.3s ease;
    }

    .doc-card:hover .doc-icon {
      background: var(--accent-color);
      color: #ffffff;
      box-shadow: 0 0 12px var(--accent-glow);
    }

    .doc-icon svg {
      width: 20px;
      height: 20px;
    }

    .doc-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .doc-title {
      font-size: 1.15rem;
      font-weight: 600;
      color: #ffffff;
      transition: color 0.2s ease;
    }

    .doc-card:hover .doc-title {
      color: #ffffff;
    }

    .doc-meta {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .doc-arrow {
      color: var(--text-muted);
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
    }

    .doc-arrow svg {
      width: 20px;
      height: 20px;
    }

    .doc-card:hover .doc-arrow {
      color: var(--accent-color);
      transform: translateX(4px);
    }

    .footer {
      text-align: center;
      font-size: 0.85rem;
      color: var(--text-muted);
      border-top: 1px solid var(--glass-border);
      padding-top: 24px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>參考文件索引</h1>
      <div class="subtitle">快速瀏覽與點閱系統設計與資料庫架構說明文件</div>
    </header>
    
    <div class="doc-list">
      ${listHtml || '<div style="text-align:center; padding: 40px; color: var(--text-muted);">目前無任何文件。</div>'}
    </div>
    
    <div class="footer">
      本頁面自動生成 &copy; ${new Date().getFullYear()} DMS V5 文件系統
    </div>
  </div>
</body>
</html>`;

    fs.writeFileSync(indexOutPath, htmlContent, 'utf-8');
    console.log(`[索引更新] 成功更新 index.html`);
  } catch (err) {
    console.error('產生索引 index.html 失敗:', err.message);
  }
}

// 掃描並轉換目錄下所有的 .md 檔案
function convertAll() {
  console.log('正在掃描目錄下現存的所有 Markdown 檔案...');
  try {
    const files = fs.readdirSync(DOCS_DIR);
    let count = 0;
    files.forEach(file => {
      if (path.extname(file).toLowerCase() === '.md') {
        const fullPath = path.join(DOCS_DIR, file);
        convertFile(fullPath, false);
        count++;
      }
    });
    console.log(`全部轉換完成，共轉換了 ${count} 個檔案。\n`);
    generateIndexHtml();
  } catch (err) {
    console.error('掃描目錄失敗:', err.message);
  }
}

// 啟動時執行一次完整轉換並結束
convertAll();
