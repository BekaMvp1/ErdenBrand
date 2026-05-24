import { useState, useEffect } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { ru } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import api from '../api';
import { weekNumberForDate, weekMetaForNumber } from '../utils/paymentCalendarWeeks';

registerLocale('ru', ru);

const INCOME_ARTICLES = [
  'План к перечислению ВБ',
  'Получение займа',
  'План поступление заказчики',
  'План поступление МСК',
  'Досрочный вывод по кнопке',
  'Другие поступления',
];

const PAYMENT_CALENDAR_YEAR = 2026;

const LABEL = {
  display: 'block',
  color: '#94a3b8',
  fontSize: 12,
  marginBottom: 6,
  marginTop: 14,
  fontWeight: 600,
};

const INPUT = {
  width: '100%',
  background: '#1e2a3a',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 13,
  boxSizing: 'border-box',
  marginBottom: 4,
};

function parseDateValue(val) {
  const iso = String(val || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return new Date(`${iso}T12:00:00`);
}

function toLocalIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildInitialDates(initialData) {
  if (!initialData?.dates?.length) {
    return [{ date: null, amount: '' }];
  }
  return initialData.dates.map((d) => ({
    date: parseDateValue(d.date),
    amount: String(d.amount ?? ''),
  }));
}

function getWeekLabel(date) {
  if (!date) return '';
  const week = weekNumberForDate(date.toISOString().slice(0, 10));
  const meta = weekMetaForNumber(week);
  if (!meta) return `Нед ${week}`;
  const startD = new Date(`${meta.start}T12:00:00`);
  const endD = new Date(`${meta.end}T12:00:00`);
  const fmt = (d) =>
    d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return `Нед ${week}: ${fmt(startD)}–${fmt(endD)}`;
}

export default function IncomePlanForm({
  onSave,
  onClose,
  onRefreshCalendar,
  initialData = null,
  isEdit = false,
  editId = null,
}) {
  const [form, setForm] = useState({
    article: initialData?.article || '',
    client: initialData?.client || '',
    note: initialData?.note || '',
  });
  const [dates, setDates] = useState(() => buildInitialDates(initialData));
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState([]);
  const [showCustomClient, setShowCustomClient] = useState(false);

  useEffect(() => {
    api.orders
      .list({ limit: 200 })
      .then((r) => {
        const orders = r?.orders || r?.rows || r || [];
        const unique = [];
        (Array.isArray(orders) ? orders : []).forEach((o) => {
          const name = o.client_name || o.client?.name;
          if (name && !unique.includes(name)) {
            unique.push(name);
          }
        });
        const sorted = unique.sort((a, b) => a.localeCompare(b, 'ru'));
        setClients(sorted);
        const clientName = String(initialData?.client || '').trim();
        if (clientName && !sorted.includes(clientName)) {
          setShowCustomClient(true);
        }
      })
      .catch(() => {});
  }, [initialData?.client]);

  const addDate = () => {
    setDates((prev) => [...prev, { date: null, amount: '' }]);
  };

  const removeDate = (i) => {
    setDates((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateDate = (i, field, val) => {
    setDates((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, [field]: val } : d))
    );
  };

  const totalAmount = dates.reduce(
    (sum, d) => sum + parseFloat(d.amount || 0),
    0
  );

  const handleSave = async () => {
    if (!form.article) {
      alert('⚠️ Выберите статью поступления');
      return;
    }
    if (!form.client.trim()) {
      alert('⚠️ Укажите заказчика');
      return;
    }
    const validDates = dates.filter((d) => d.date && d.amount);
    if (validDates.length === 0) {
      alert('⚠️ Добавьте хотя бы одну дату с суммой');
      return;
    }

    const payload = {
      article: form.article,
      client: form.client.trim(),
      note: form.note.trim(),
      total_amount: totalAmount,
      dates: validDates.map((d) => {
        const iso = toLocalIso(d.date);
        return {
          date: iso,
          week_number: weekNumberForDate(iso),
          year: PAYMENT_CALENDAR_YEAR,
          amount: parseFloat(d.amount),
        };
      }),
    };

    setSaving(true);
    try {
      const plan = isEdit && editId
        ? await api.incomePlans.update(editId, payload)
        : await api.incomePlans.create(payload);

      if (typeof onRefreshCalendar === 'function') {
        onRefreshCalendar();
      }
      onSave(plan);
      alert(
        isEdit
          ? '✅ Изменения сохранены!'
          : '✅ Плановое поступление сохранено!'
      );
    } catch (err) {
      alert(`❌ Ошибка: ${err.message || 'не удалось сохранить'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label style={LABEL}>1. Статья поступления</label>
      <select
        value={form.article}
        onChange={(e) => setForm((f) => ({ ...f, article: e.target.value }))}
        style={INPUT}
      >
        <option value="">— Выберите статью —</option>
        {INCOME_ARTICLES.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      <label style={LABEL}>2. От какого заказчика</label>
      <div style={{ position: 'relative' }}>
        <select
          value={showCustomClient ? '__custom__' : form.client}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setForm((f) => ({ ...f, client: '' }));
              setShowCustomClient(true);
            } else {
              setShowCustomClient(false);
              setForm((f) => ({ ...f, client: e.target.value }));
            }
          }}
          style={{
            ...INPUT,
            marginBottom: 8,
            cursor: 'pointer',
          }}
        >
          <option value="">— Выберите заказчика —</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="__custom__">✏️ Ввести вручную...</option>
        </select>

        {showCustomClient ? (
          <input
            type="text"
            value={form.client}
            onChange={(e) =>
              setForm((f) => ({ ...f, client: e.target.value }))
            }
            placeholder="Введите название заказчика..."
            style={{
              ...INPUT,
              border: '1px solid #a3e635',
              marginBottom: 0,
            }}
            autoFocus={!isEdit}
          />
        ) : null}
      </div>

      <label style={LABEL}>3. Даты и суммы поступления</label>

      <div
        style={{
          background: '#0a1628',
          border: '1px solid #1e3a5f',
          borderRadius: 8,
          padding: '12px',
          marginBottom: 12,
        }}
      >
        {dates.map((d, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr auto',
              gap: 8,
              marginBottom: 10,
              alignItems: 'start',
            }}
          >
            <div>
              <div
                style={{
                  color: '#64748b',
                  fontSize: 10,
                  marginBottom: 4,
                }}
              >
                Дата поступления
              </div>
              <DatePicker
                locale="ru"
                selected={d.date}
                onChange={(date) => updateDate(i, 'date', date)}
                dateFormat="dd.MM.yyyy"
                placeholderText="дд.мм.гггг"
                showWeekNumbers
                customInput={
                  <button
                    type="button"
                    style={{
                      background: '#1e3a5f',
                      color: d.date ? '#a3e635' : '#64748b',
                      border: '1px solid #374151',
                      borderRadius: 6,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      fontSize: 12,
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    📅{' '}
                    {d.date
                      ? d.date.toLocaleDateString('ru-RU')
                      : 'Выбрать дату'}
                  </button>
                }
              />
              {d.date ? (
                <div
                  style={{
                    color: '#64748b',
                    fontSize: 10,
                    marginTop: 3,
                  }}
                >
                  {getWeekLabel(d.date)}
                </div>
              ) : null}
            </div>

            <div>
              <div
                style={{
                  color: '#64748b',
                  fontSize: 10,
                  marginBottom: 4,
                }}
              >
                Сумма (сом)
              </div>
              <input
                type="number"
                min={0}
                value={d.amount}
                onChange={(e) => updateDate(i, 'amount', e.target.value)}
                placeholder="0"
                style={{
                  ...INPUT,
                  marginBottom: 0,
                  color: '#4ade80',
                  fontWeight: 600,
                }}
              />
            </div>

            <div style={{ paddingTop: 22 }}>
              {dates.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeDate(i)}
                  style={{
                    background: '#2a0a0a',
                    color: '#f87171',
                    border: '1px solid #f87171',
                    borderRadius: 6,
                    padding: '7px 10px',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addDate}
          style={{
            background: '#1e3a5f',
            color: '#93c5fd',
            border: '1px dashed #1e3a5f',
            borderRadius: 6,
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: 12,
            width: '100%',
          }}
        >
          + Добавить дату поступления
        </button>
      </div>

      {totalAmount > 0 ? (
        <div
          style={{
            background: '#0a2a0a',
            border: '1px solid #16a34a',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <span style={{ color: '#4ade80', fontWeight: 600 }}>
            Итого запланировано:
          </span>
          <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 16 }}>
            {totalAmount.toLocaleString('ru-RU')} сом
          </span>
        </div>
      ) : null}

      <label style={LABEL}>Примечание (необязательно)</label>
      <textarea
        value={form.note}
        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
        placeholder="Дополнительная информация..."
        rows={2}
        style={{
          ...INPUT,
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            background: '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '12px',
            cursor: saving ? 'wait' : 'pointer',
            fontSize: 14,
            fontWeight: 700,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving
            ? 'Сохранение…'
            : isEdit
              ? '💾 Сохранить изменения'
              : '✅ Сохранить план'}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: '#1e2a3a',
            color: '#94a3b8',
            border: '1px solid #374151',
            borderRadius: 8,
            padding: '12px 20px',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
