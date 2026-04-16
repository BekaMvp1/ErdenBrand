/**
 * Размерная сетка 38–56 с буквенными эквивалентами (neon / тёмная тема)
 */

import { useCallback } from 'react';

export const SIZE_GRID_MAP = [
  { num: 38, letter: 'XXS' },
  { num: 40, letter: 'XS' },
  { num: 42, letter: 'S' },
  { num: 44, letter: 'M' },
  { num: 46, letter: 'L' },
  { num: 48, letter: 'XL' },
  { num: 50, letter: 'XXL' },
  { num: 52, letter: 'XXXL' },
  { num: 54, letter: '4XL' },
  { num: 56, letter: '5XL' },
];

const GRID_NUM_SET = new Set(SIZE_GRID_MAP.map((r) => r.num));

/** Числовые размеры сетки из списка строк размеров заказа */
export function sizeGridNumericFromSelection(selectedStrings) {
  const nums = new Set();
  for (const raw of selectedStrings || []) {
    const t = String(raw ?? '').trim();
    if (!t) continue;
    const n = parseInt(t, 10);
    if (!Number.isNaN(n) && String(n) === t && GRID_NUM_SET.has(n)) {
      nums.add(n);
      continue;
    }
    const upper = t.toUpperCase();
    if (upper === '3XL') {
      nums.add(52);
      continue;
    }
    const row = SIZE_GRID_MAP.find((m) => m.letter.toUpperCase() === upper);
    if (row) nums.add(row.num);
  }
  return [...nums].sort((a, b) => a - b);
}

const cellBase =
  'border border-white/20 px-1.5 py-2 text-center text-[13px] min-w-[40px] transition-colors duration-150 select-none';
const letterCell = 'text-xs';

export default function SizeGrid({
  value = [],
  onChange,
  quantities = {},
  onQuantityChange,
  showQuantity = false,
  readOnly = false,
}) {
  const isSelected = (num) => value.includes(num);

  const toggle = useCallback(
    (num) => {
      if (readOnly) return;
      const next = value.includes(num)
        ? value.filter((s) => s !== num)
        : [...value, num].sort((a, b) => a - b);
      onChange?.(next);
    },
    [value, onChange, readOnly]
  );

  const numCellClass = (num) =>
    `${isSelected(num) ? 'bg-amber-500 text-black font-bold' : 'bg-transparent text-[#ECECEC] dark:text-dark-text/90'} ${
      readOnly ? 'cursor-default' : 'cursor-pointer'
    }`;

  return (
    <div className="font-inherit w-full">
      <table className="w-full border-collapse mb-2">
        <tbody>
          <tr>
            {SIZE_GRID_MAP.map(({ num }) => (
              <td
                key={num}
                role="gridcell"
                tabIndex={readOnly ? -1 : 0}
                onClick={() => toggle(num)}
                onKeyDown={(e) => {
                  if (readOnly) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(num);
                  }
                }}
                className={`${cellBase} ${numCellClass(num)}`}
              >
                {num}
              </td>
            ))}
          </tr>
          <tr>
            {SIZE_GRID_MAP.map(({ num, letter }) => (
              <td
                key={`${num}-${letter}`}
                onClick={() => toggle(num)}
                className={`${cellBase} ${letterCell} ${
                  isSelected(num)
                    ? 'bg-amber-500 text-black font-bold'
                    : 'text-[#ECECEC]/70 dark:text-dark-text/55'
                } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {letter}
              </td>
            ))}
          </tr>
          {showQuantity && (
            <tr>
              {SIZE_GRID_MAP.map(({ num }) => (
                <td key={`qty-${num}`} className="border border-white/20 px-0.5 py-1 text-center align-middle">
                  {isSelected(num) ? (
                    <input
                      type="number"
                      min={0}
                      value={quantities[num] ?? quantities[String(num)] ?? ''}
                      onChange={(e) =>
                        onQuantityChange?.(num, Number(e.target.value))
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="w-10 mx-auto block text-center rounded bg-accent-2/90 dark:bg-dark-800 border border-white/25 text-primary-400 text-[11px] font-semibold py-0.5 px-0.5"
                    />
                  ) : (
                    <span className="text-[10px] text-white/25">—</span>
                  )}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>

      {value.length > 0 && (
        <div className="text-[11px] text-[#ECECEC]/55 dark:text-dark-text/50 mt-1">
          Выбрано:{' '}
          {value
            .map((num) => {
              const s = SIZE_GRID_MAP.find((r) => r.num === num);
              return `${num}(${s?.letter})`;
            })
            .join(', ')}
          {showQuantity && (
            <span className="ml-2 text-primary-400">
              · Итого:{' '}
              {Object.values(quantities).reduce((sum, v) => sum + (Number(v) || 0), 0)} шт
            </span>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap gap-1.5 items-center mt-2">
          <span className="text-[11px] text-[#ECECEC]/50 dark:text-dark-text/45 self-center">Быстрый выбор:</span>
          {[
            { label: 'S–XL', sizes: [42, 44, 46, 48] },
            { label: 'S–XXL', sizes: [42, 44, 46, 48, 50] },
            { label: 'Все', sizes: SIZE_GRID_MAP.map((s) => s.num) },
            { label: 'Сбросить', sizes: [] },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange?.(preset.sizes)}
              className="px-2 py-0.5 text-[11px] rounded border border-white/20 text-[#ECECEC]/70 hover:border-primary-500/60 hover:text-primary-400 bg-transparent"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
