import { useState, useEffect } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { ru } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import api from '../api';
import { weekNumberForDate, weekMetaForNumber } from '../utils/paymentCalendarWeeks';

registerLocale('ru', ru);

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

function safeArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function ExpensePlanForm({
  onSave,
  onClose,
  initialData = null,
  isEdit = false,
  editId = null,
}) {
  const [form, setForm] = useState({
    plan_date: initialData?.plan_date || '',
    article: initialData?.article || '',
    tz: initialData?.tz || '',
    supplier: initialData?.supplier || '',
    employee: initialData?.employee || '',
    amount: initialData?.amount != null ? String(initialData.amount) : '',
    note: initialData?.note || '',
    week_number: initialData?.week_number ?? null,
    year: initialData?.year ?? PAYMENT_CALENDAR_YEAR,
  });
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [articleGroups, setArticleGroups] = useState([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [showCustomSupplier, setShowCustomSupplier] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setArticlesLoading(true);
    api
      .get('/api/finance/payment-calendar-articles')
      .then((data) => {
        if (cancelled) return;
        const groups = Array.isArray(data) ? data : [];
        setArticleGroups(
          groups.filter(
            (g) => g?.category && Array.isArray(g.articles) && g.articles.length > 0
          )
        );
      })
      .catch(() => {
        if (!cancelled) setArticleGroups([]);
      })
      .finally(() => {
        if (!cancelled) setArticlesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    Promise.all([
      api.references.suppliers().catch(() => []),
      api.orders.list({ limit: 200 }).catch(() => []),
    ]).then(([suppRes, ordersRes]) => {
      const suppList = Array.isArray(suppRes) ? suppRes : [];
      const fromRefs = suppList
        .map((s) => s.name || s.title)
        .filter(Boolean);

      const list = ordersRes?.orders || ordersRes?.rows || ordersRes || [];
      const orderList = Array.isArray(list) ? list : [];
      const fromOrders = [];

      orderList.forEach((o) => {
        [...safeArray(o.fabric_data), ...safeArray(o.fittings_data)].forEach((m) => {
          const name = m.supplier || m.supplier_name;
          if (name && !fromOrders.includes(name)) fromOrders.push(name);
        });
      });

      const merged = [...new Set([...fromRefs, ...fromOrders])].sort((a, b) =>
        a.localeCompare(b, 'ru')
      );
      setSuppliers(merged);
      setOrders(orderList);

      const supplierName = String(initialData?.supplier || '').trim();
      if (supplierName && !merged.includes(supplierName)) {
        setShowCustomSupplier(true);
      }
    });
  }, [initialData?.supplier]);

  const handleDateChange = (date) => {
    if (!date) {
      setForm((f) => ({
        ...f,
        plan_date: '',
        week_number: null,
        year: null,
      }));
      return;
    }
    const iso = toLocalIso(date);
    setForm((f) => ({
      ...f,
      plan_date: iso,
      week_number: weekNumberForDate(iso),
      year: PAYMENT_CALENDAR_YEAR,
    }));
  };

  const handleSave = async () => {
    if (!form.plan_date) {
      alert('⚠️ Выберите дату расхода');
      return;
    }
    if (!form.article) {
      alert('⚠️ Выберите статью расхода');
      return;
    }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      alert('⚠️ Укажите сумму');
      return;
    }

    const payload = {
      plan_date: form.plan_date,
      article: form.article,
      tz: form.tz || '',
      supplier: form.supplier || '',
      employee: form.employee || '',
      amount,
      note: form.note || '',
      week_number: form.week_number,
      year: form.year || PAYMENT_CALENDAR_YEAR,
    };

    setSaving(true);
    try {
      const plan =
        isEdit && editId
          ? await api.expensePlans.update(editId, payload)
          : await api.expensePlans.create(payload);

      if (typeof onRefreshCalendar === 'function') {
        onRefreshCalendar();
      }
      onSave(plan);
      alert(isEdit ? '✅ Расход обновлён!' : '✅ Расход запланирован!');
    } catch (err) {
      alert(`❌ Ошибка: ${err.message || 'не удалось сохранить'}`);
    } finally {
      setSaving(false);
    }
  };

  const weekLabel = form.plan_date
    ? (() => {
        const meta = weekMetaForNumber(form.week_number);
        return meta ? `Нед ${form.week_number}` : '';
      })()
    : '';

  return (
    <div>
      <label style={LABEL}>1. Дата для платёжного календаря</label>
      <DatePicker
        locale="ru"
        selected={form.plan_date ? parseDateValue(form.plan_date) : null}
        onChange={handleDateChange}
        dateFormat="dd.MM.yyyy"
        placeholderText="дд.мм.гггг"
        showWeekNumbers
        customInput={
          <button
            type="button"
            style={{
              ...INPUT,
              textAlign: 'left',
              cursor: 'pointer',
              color: form.plan_date ? '#a3e635' : '#64748b',
            }}
          >
            📅{' '}
            {form.plan_date
              ? new Date(form.plan_date).toLocaleDateString('ru-RU')
              : 'Выбрать дату'}
            {weekLabel ? (
              <span style={{ color: '#64748b', fontSize: 11, marginLeft: 8 }}>
                {weekLabel}
              </span>
            ) : null}
          </button>
        }
      />

      <label style={LABEL}>2. Статья расхода</label>
      <select
        value={form.article}
        onChange={(e) => setForm((f) => ({ ...f, article: e.target.value }))}
        style={INPUT}
        disabled={articlesLoading}
      >
        <option value="">
          {articlesLoading ? 'Загрузка статей…' : '— Выберите статью —'}
        </option>
        {form.article &&
        !articleGroups.some((g) => g.articles.includes(form.article)) ? (
          <option value={form.article}>{form.article}</option>
        ) : null}
        {articleGroups.map((group) => (
          <optgroup key={group.category} label={group.category}>
            {group.articles.map((article) => (
              <option key={`${group.category}-${article}`} value={article}>
                {article}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <label style={LABEL}>3. ТЗ заказа</label>
      <select
        value={form.tz}
        onChange={(e) => setForm((f) => ({ ...f, tz: e.target.value }))}
        style={INPUT}
      >
        <option value="">— Выберите заказ (необязательно) —</option>
        {orders.map((o) => (
          <option key={o.id} value={o.number || o.tz_code || String(o.id)}>
            {(o.number || o.tz_code || `№${o.id}`) +
              (o.product_name || o.model_name || o.name
                ? ` — ${o.product_name || o.model_name || o.name}`
                : '')}
          </option>
        ))}
      </select>

      <label style={LABEL}>4. Поставщик</label>
      <select
        value={showCustomSupplier ? '__custom__' : form.supplier}
        onChange={(e) => {
          if (e.target.value === '__custom__') {
            setShowCustomSupplier(true);
            setForm((f) => ({ ...f, supplier: '' }));
          } else {
            setShowCustomSupplier(false);
            setForm((f) => ({ ...f, supplier: e.target.value }));
          }
        }}
        style={INPUT}
      >
        <option value="">— Выберите поставщика —</option>
        {suppliers.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        <option value="__custom__">✏️ Ввести вручную...</option>
      </select>
      {showCustomSupplier ? (
        <input
          type="text"
          value={form.supplier}
          onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
          placeholder="Название поставщика..."
          style={{
            ...INPUT,
            marginTop: 6,
            border: '1px solid #fbbf24',
          }}
          autoFocus={!isEdit}
        />
      ) : null}

      <label style={LABEL}>5. Сотрудник</label>
      <input
        type="text"
        value={form.employee}
        onChange={(e) => setForm((f) => ({ ...f, employee: e.target.value }))}
        placeholder="ФИО сотрудника..."
        style={INPUT}
      />

      <label style={LABEL}>6. Сумма (сом)</label>
      <input
        type="number"
        min={0}
        value={form.amount}
        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        placeholder="0"
        style={{
          ...INPUT,
          color: '#f87171',
          fontWeight: 700,
          fontSize: 15,
        }}
      />
      {parseFloat(form.amount) > 0 ? (
        <div style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>
          Расход: {parseFloat(form.amount).toLocaleString('ru-RU')} сом
        </div>
      ) : null}

      <label style={LABEL}>7. Примечание</label>
      <textarea
        value={form.note}
        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
        placeholder="Дополнительная информация..."
        rows={3}
        style={{
          ...INPUT,
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            background: '#fbbf24',
            color: '#000',
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
              : '📤 Запланировать расход'}
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
