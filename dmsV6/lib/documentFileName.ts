export const WINDOWS_FILE_NAME_VALIDATION_MESSAGE =
  '不得使用下列特殊字元：< > : " / \\ | ? *；不得輸入控制字元，結尾也不得使用空白或句點。';

const WINDOWS_BLOCKED_FILE_NAME_CHARACTER_PATTERN = /[<>:"/\\|?*\u0000-\u001F\u007F]/;
const WINDOWS_BLOCKED_FILE_NAME_ENDING_PATTERN = /[ .]$/;

export const hasWindowsBlockedFileNameCharacter = (value: string) =>
  WINDOWS_BLOCKED_FILE_NAME_CHARACTER_PATTERN.test(value);

export const getWindowsFileNameValidationError = (value: string) =>
  hasWindowsBlockedFileNameCharacter(value) || WINDOWS_BLOCKED_FILE_NAME_ENDING_PATTERN.test(value)
    ? WINDOWS_FILE_NAME_VALIDATION_MESSAGE
    : null;

export const sanitizeWindowsFileNamePart = (value: string) =>
  value
    .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, '_')
    .replace(/[ .]+$/g, '');
