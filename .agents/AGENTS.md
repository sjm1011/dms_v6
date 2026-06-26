# 專案特定開發規則 (Project Custom Rules)

## 批次檔規範 (Batch File Specifications)
* **換行格式**：本專案中的所有 Windows 批次檔（`.bat`、`.cmd`）**必須使用 Windows 的換行符號（CRLF, `\r\n`）**，嚴禁使用 UNIX 的換行符號（LF, `\n`）。
* **編碼規格**：必須以 UTF-8（無 BOM）編碼儲存，且在包含任何中文字元前必須優先執行 `chcp 65001 > nul`。
