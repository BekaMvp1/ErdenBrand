/** API paths модуля штрихкодов */
export const BARCODE_PRINT_DOCS_API = '/api/barcodes/barcode-print-docs';
export const BARCODE_CATALOG_API = '/api/barcodes/catalog';
export const BARCODE_DOCS_API = '/api/barcodes';
export const barcodeDocumentApi = (id) => `/api/barcodes/documents/${id}`;

export function defaultPrintDocName(date = new Date()) {
  return `Печать ${date.toLocaleDateString('ru-RU')}`;
}

export function formatPrintDate(value) {
  if (!value) return new Date().toLocaleDateString('ru-RU');
  return new Date(value).toLocaleDateString('ru-RU');
}

export function formatStatus(status) {
  if (status === 'printed') return 'Напечатан';
  return 'Черновик';
}
