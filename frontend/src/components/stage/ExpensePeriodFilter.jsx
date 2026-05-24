import DatePicker, { registerLocale } from 'react-datepicker';
import { ru } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';

registerLocale('ru', ru);

export function formatIsoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoLocal(iso) {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function mondayOfDate(d = new Date()) {
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  return mon;
}

export function defaultExpensePeriodRange() {
  const mon = mondayOfDate(new Date());
  const end = new Date(mon);
  end.setDate(end.getDate() + 28);
  return { dateFrom: formatIsoLocal(mon), dateTo: formatIsoLocal(end) };
}

export default function ExpensePeriodFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  filteredCount,
}) {
  const btnBase = {
    background: '#1e2a3a',
    color: '#94a3b8',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '5px 10px',
    cursor: 'pointer',
    fontSize: 11,
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: 16,
        padding: '12px 16px',
        background: '#0a1628',
        border: '1px solid #1e3a5f',
        borderRadius: 10,
      }}
    >
      <span
        style={{
          color: '#64748b',
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        📅 Период:
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#94a3b8', fontSize: 11 }}>от</span>
        <DatePicker
          locale="ru"
          selected={parseIsoLocal(dateFrom)}
          onChange={(date) => {
            if (date) onDateFromChange(formatIsoLocal(date));
          }}
          dateFormat="dd.MM.yyyy"
          placeholderText="дд.мм.гггг"
          customInput={
            <button
              type="button"
              style={{
                background: '#1e3a5f',
                color: '#a3e635',
                border: '1px solid #374151',
                borderRadius: 6,
                padding: '5px 12px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                minWidth: 110,
              }}
            >
              📅{' '}
              {dateFrom
                ? parseIsoLocal(dateFrom)?.toLocaleDateString('ru-RU')
                : 'Начало'}
            </button>
          }
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#94a3b8', fontSize: 11 }}>до</span>
        <DatePicker
          locale="ru"
          selected={parseIsoLocal(dateTo)}
          onChange={(date) => {
            if (date) onDateToChange(formatIsoLocal(date));
          }}
          dateFormat="dd.MM.yyyy"
          placeholderText="дд.мм.гггг"
          customInput={
            <button
              type="button"
              style={{
                background: '#1e3a5f',
                color: '#fbbf24',
                border: '1px solid #374151',
                borderRadius: 6,
                padding: '5px 12px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                minWidth: 110,
              }}
            >
              📅{' '}
              {dateTo ? parseIsoLocal(dateTo)?.toLocaleDateString('ru-RU') : 'Конец'}
            </button>
          }
        />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => {
            const mon = mondayOfDate(new Date());
            const sun = new Date(mon);
            sun.setDate(mon.getDate() + 6);
            onDateFromChange(formatIsoLocal(mon));
            onDateToChange(formatIsoLocal(sun));
          }}
          style={btnBase}
        >
          Эта нед.
        </button>
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            const from = new Date(now.getFullYear(), now.getMonth(), 1);
            const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            onDateFromChange(formatIsoLocal(from));
            onDateToChange(formatIsoLocal(to));
          }}
          style={btnBase}
        >
          Этот мес.
        </button>
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            const from = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const to = new Date(now.getFullYear(), now.getMonth() + 2, 0);
            onDateFromChange(formatIsoLocal(from));
            onDateToChange(formatIsoLocal(to));
          }}
          style={btnBase}
        >
          След. мес.
        </button>
        <button
          type="button"
          onClick={() => {
            onDateFromChange('');
            onDateToChange('');
          }}
          style={{
            ...btnBase,
            background: '#1a1a2e',
            color: '#475569',
          }}
        >
          ✕ Сброс
        </button>
      </div>

      <div
        style={{
          marginLeft: 'auto',
          color: '#64748b',
          fontSize: 11,
        }}
      >
        Показано: {filteredCount} заказов
      </div>
    </div>
  );
}
