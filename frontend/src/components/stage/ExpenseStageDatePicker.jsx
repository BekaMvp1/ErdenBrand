import DatePicker, { registerLocale } from 'react-datepicker';
import { ru } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';

registerLocale('ru', ru);

function parseIsoDate(iso) {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatIsoLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Датапикер для планирования расходов (plan / fact).
 */
export default function ExpenseStageDatePicker({
  value,
  onChange,
  variant = 'plan',
}) {
  const selected = parseIsoDate(value);
  const isFact = variant === 'fact';
  const accentColor = isFact ? '#fbbf24' : '#a3e635';
  const bg = isFact ? '#1a1a2e' : '#1e3a5f';

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: 'inline-block' }}>
      <DatePicker
        locale="ru"
        selected={selected}
        onChange={(date) => {
          if (date) onChange(formatIsoLocal(date));
        }}
        dateFormat="dd.MM.yyyy"
        placeholderText={isFact ? 'дд.мм.гггг (факт)' : 'дд.мм.гггг'}
        showWeekNumbers
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
        weekLabel="Нед"
        customInput={
          <button
            type="button"
            style={{
              background: bg,
              color: accentColor,
              border: '1px solid #374151',
              borderRadius: 6,
              padding: '5px 10px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              minWidth: 110,
              textAlign: 'left',
            }}
          >
            📅{' '}
            {selected
              ? selected.toLocaleDateString('ru-RU')
              : isFact
                ? 'Выбрать дату (факт)'
                : 'Выбрать дату'}
          </button>
        }
      />
    </div>
  );
}
