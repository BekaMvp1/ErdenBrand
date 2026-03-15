/**
 * Для числовых инпутов: 0 показываем как пустое поле с placeholder "0",
 * чтобы не мешать вводу (не нужно удалять ноль перед набором).
 */
export function numInputValue(val) {
  if (val === '' || val === null || val === undefined) return '';
  const n = Number(val);
  return Number.isFinite(n) && n === 0 ? '' : String(val);
}
