/**
 * HTML термоэтикеток для печати
 */

export function openThermalPrintWindow({
  items,
  title = 'Этикетки',
  labelWidth = 58,
  labelHeight = 40,
  printDate,
}) {
  const selected = (items || []).filter((r) => r && r.selected !== false);
  if (!selected.length) {
    return { ok: false, error: 'Выберите позиции' };
  }

  const dateLabel = printDate
    ? new Date(printDate).toLocaleDateString('ru-RU')
    : new Date().toLocaleDateString('ru-RU');

  const expanded = [];
  selected.forEach((item) => {
    const qty = parseInt(item.printQty ?? item.quantity ?? 1, 10) || 1;
    for (let n = 0; n < qty; n += 1) {
      expanded.push(item);
    }
  });

  const w = labelWidth;
  const h = labelHeight;
  const barcodeFontPx = Math.min(80, Math.max(70, Math.round(76 * (w / 58))));

  const printWin = window.open('', '_blank', 'width=800,height=600');
  if (!printWin) {
    return { ok: false, error: 'Не удалось открыть окно печати' };
  }

  printWin.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#fff; }
    .label {
      width: ${w}mm;
      height: ${h}mm;
      padding: 1.2mm 1.5mm;
      display: flex;
      flex-direction: column;
      vertical-align: top;
      overflow: visible;
      page-break-inside: avoid;
      font-family: Arial, sans-serif;
      border: 0.5mm solid #000;
      position: relative;
    }
    .tz {
      font-size: 6.5pt;
      font-weight: 900;
      color: #000;
      margin-bottom: 0.3mm;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }
    .barcode-block {
      width: 100%;
      max-width: none;
      overflow: visible;
      flex-shrink: 0;
      margin-bottom: 0.3mm;
    }
    .barcode-font {
      font-family: 'Libre Barcode 128', monospace;
      font-size: ${barcodeFontPx}px;
      line-height: 1;
      display: block;
      width: 100%;
      max-width: none;
      overflow: visible;
      white-space: nowrap;
      margin-bottom: 0;
      text-align: center;
      letter-spacing: 0;
    }
    .article {
      font-size: ${Math.max(9, Math.round(h * 0.25))}pt;
      font-weight: 900;
      color: #000;
      margin-bottom: 0.5mm;
      letter-spacing: 0.3px;
      line-height: 1.1;
      flex-shrink: 0;
    }
    .bottom-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: auto;
    }
    .color-text {
      font-size: ${Math.max(9, Math.round(h * 0.22))}pt;
      font-weight: 800;
      color: #000;
    }
    .size-box {
      font-size: ${Math.max(12, Math.round(h * 0.35))}pt;
      font-weight: 900;
      border: 2.5px solid #000;
      padding: 0.5mm 2.5mm;
      display: inline-block;
      line-height: 1.1;
      letter-spacing: -0.5px;
    }
    .print-date {
      font-size: 14px;
      font-weight: bold;
      color: #000;
      text-align: center;
      margin: 0;
      padding: 0;
      line-height: 1;
    }
    @media print {
      @page { size: ${w}mm ${h}mm; margin: 0; }
      body { margin: 0; }
      .label { border: none; width: ${w}mm; height: ${h}mm; }
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128&display=swap" rel="stylesheet">
</head>
<body>
  ${expanded
    .map(
      (item) => `
  <div class="label">
    <div class="tz">ТЗ: ${item.tz || ''}</div>
    ${
      item.barcode
        ? `<div class="barcode-block">
             <div class="barcode-font">${item.barcode}</div>
           </div>`
        : ''
    }
    <div class="article">${item.article || ''}</div>
    <div class="bottom-row">
      <span class="color-text">${item.color || ''}</span>
      ${item.size ? `<span class="size-box">${item.size}</span>` : ''}
    </div>
    <div class="print-date">${dateLabel}</div>
  </div>`
    )
    .join('')}
</body>
</html>`);

  printWin.document.close();
  printWin.onload = () => {
    setTimeout(() => {
      printWin.focus();
      printWin.print();
    }, 500);
  };

  return { ok: true, count: expanded.length };
}
