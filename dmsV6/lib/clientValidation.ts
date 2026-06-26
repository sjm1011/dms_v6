export function showRequiredFieldMessage(
  message: string,
  target?: HTMLElement | null
) {
  window.alert(message);
  window.setTimeout(() => {
    target?.focus();
  }, 0);
}
