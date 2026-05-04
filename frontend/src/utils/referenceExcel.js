/**
 * Импорт/шаблоны Excel для справочников model-refs.
 */

import * as XLSX from 'xlsx';

export function cellStr(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v).trim();
  return String(v).trim();
}

/**
 * Первый лист, первая строка — заголовок (пропускаем), остальные — данные.
 * @param {File} file
 * @returns {Promise<string[][]>}
 */
export async function readExcelDataRows(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const name = wb.SheetNames[0];
  if (!name) return [];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (!Array.isArray(rows) || rows.length < 2) return [];
  return rows.slice(1);
}

/**
 * @param {'name' | 'operations'} excelMode
 * @param {string} baseFileName — для имени файла (латиница/кириллица, безопасно эскейпим)
 */
export function downloadReferenceTemplate(excelMode, baseFileName) {
  const header =
    excelMode === 'name'
      ? [['Название']]
      : [
          [
            'Название операции',
            'Норма времени (мин)',
            'Расценка (сом)',
          ],
        ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(header);
  const safe = String(baseFileName || 'шаблон').replace(/[/\\?%*:|"<>]/g, '_');
  XLSX.utils.book_append_sheet(wb, ws, 'Импорт');
  XLSX.writeFile(wb, `${safe}-шаблон.xlsx`);
}
