/**
 * HTML термоэтикеток для печати (JsBarcode / CODE128)
 */

function pickLabelFields(item) {
  return {
    tz: item?.tz ?? item?.title ?? '',
    barcode: item?.barcode ?? item?.code ?? '',
    article: item?.article ?? '',
    color: item?.color ?? '',
    size: item?.size ?? '',
  };
}

export function openThermalPrintWindow({
  items,
  title = 'Этикетки',
  labelWidth = 58,
  labelHeight = 40,
  printDate,
}) {
  void printDate;

  const selected = (items || []).filter((r) => r && r.selected !== false);
  if (!selected.length) {
    return { ok: false, error: 'Выберите позиции' };
  }

  const expanded = [];
  selected.forEach((item) => {
    const qty = parseInt(item.printQty ?? item.quantity ?? 1, 10) || 1;
    for (let n = 0; n < qty; n += 1) {
      expanded.push(item);
    }
  });

  const w = labelWidth;
  const h = labelHeight;

  const barcodeInitPayload = expanded
    .map((item, index) => ({
      index,
      code: pickLabelFields(item).barcode,
    }))
    .filter((entry) => entry.code);

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
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
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
      overflow: hidden;
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
    .barcode-wrap {
      width: 100%;
      margin: 0;
      padding: 0;
      flex-shrink: 0;
      overflow: hidden;
    }
    .barcode-svg {
      width: 100%;
      height: auto;
      display: block;
    }
    .article {
      font-size: ${Math.max(10, Math.round(h * 0.3))}pt;
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
      gap: 2mm;
      flex-shrink: 0;
    }
    .color-text {
      font-size: ${Math.max(9, Math.round(h * 0.22))}pt;
      font-weight: 800;
      color: #000;
      flex: 1;
      min-width: 0;
    }
    .size-box {
      font-size: ${Math.max(12, Math.round(h * 0.35))}pt;
      font-weight: 900;
      border: 2.5px solid #000;
      padding: 0.5mm 2.5mm;
      display: inline-block;
      line-height: 1.1;
      letter-spacing: -0.5px;
      flex-shrink: 0;
    }
    @media print {
      @page { size: ${w}mm ${h}mm; margin: 0; }
      body { margin: 0; }
      .label { border: none; width: ${w}mm; height: ${h}mm; }
    }
  </style>
</head>
<body>
  ${expanded
    .map((item, index) => {
      const f = pickLabelFields(item);
      return `
  <div class="label">
    <div class="tz">ТЗ: ${f.tz}</div>
    ${
      f.barcode
        ? `<div class="barcode-wrap">
             <svg class="barcode-svg" id="barcode-${index}"></svg>
           </div>`
        : ''
    }
    <div class="article">${f.article}</div>
    <div class="bottom-row">
      <span class="color-text">${f.color}</span>
      ${f.size ? `<span class="size-box">${f.size}</span>` : ''}
    </div>
  </div>`;
    })
    .join('')}
  <script>
    window.addEventListener('load', function () {
      var entries = ${JSON.stringify(barcodeInitPayload)};
      entries.forEach(function (entry) {
        try {
          JsBarcode('#barcode-' + entry.index, entry.code, {
            format: 'CODE128',
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 11,
            margin: 2,
            textMargin: 2
          });
        } catch (err) {
          console.error('JsBarcode error', entry.index, err);
        }
      });
      setTimeout(function () {
        window.focus();
        window.print();
      }, 300);
    });
  <\/script>
</body>
</html>`);

  printWin.document.close();

  return { ok: true, count: expanded.length };
}
