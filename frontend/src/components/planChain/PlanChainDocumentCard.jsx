/**
 * Карточка документа из плана цеха (Закуп / Раскрой).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMonday, MONTH_SHORT_RU } from '../../utils/cycleWeekLabels';
import './PlanChainDocumentCard.css';

const WORKSHOP_OPTIONS = [
  { value: '', label: '— выберите цех —' },
  { value: 'floor_4', label: 'Наш цех — 4 этаж' },
  { value: 'floor_3', label: 'Наш цех — 3 этаж' },
  { value: 'floor_2', label: 'Наш цех — 2 этаж' },
  { value: 'aksy', label: 'Аксы' },
  { value: 'outsource', label: 'Аутсорс' },
];

const WORKSHOP_SET = new Set(['floor_4', 'floor_3', 'floor_2', 'aksy', 'outsource']);

export function chainDateIso(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : '';
}

export function formatWeekRangeLabel(dateStr) {
  if (!dateStr) return '—';
  const iso = chainDateIso(dateStr);
  if (!iso) return '—';
  const start = new Date(`${iso}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d) => `${d.getDate()} ${MONTH_SHORT_RU[d.getMonth()] || ''}`;
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${MONTH_SHORT_RU[end.getMonth()] || ''}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatDateRu(iso) {
  const s = chainDateIso(iso);
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}.${m}.${y}` : s;
}

export function generateSelectableWeeks() {
  const weeks = [];
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const mon = getMonday(todayIso);
  const monday = new Date(`${mon}T12:00:00`);
  for (let i = -4; i <= 8; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i * 7);
    const start = d.toISOString().slice(0, 10);
    weeks.push({ start, label: formatWeekRangeLabel(start) });
  }
  return weeks;
}

function initialWorkshop(doc) {
  const w = doc.workshop;
  if (w && WORKSHOP_SET.has(String(w))) return String(w);
  const sid = String(doc.section_id || '');
  if (WORKSHOP_SET.has(sid)) return sid;
  return '';
}

function firstPhotoUrl(order) {
  const p = order?.photos;
  if (!Array.isArray(p) || p.length === 0) return null;
  const x = p[0];
  return typeof x === 'string' && x.trim() ? x.trim() : null;
}

export default function PlanChainDocumentCard({ doc, canEdit, onSave }) {
  const weeks = useMemo(() => generateSelectableWeeks(), []);

  const [status, setStatus] = useState(doc.status || 'pending');
  const [actualWeek, setActualWeek] = useState(
    () => chainDateIso(doc.actual_week_start) || chainDateIso(doc.week_start) || ''
  );
  const [workshop, setWorkshop] = useState(() => initialWorkshop(doc));
  const [comment, setComment] = useState(doc.comment || '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(doc.status || 'pending');
    setActualWeek(chainDateIso(doc.actual_week_start) || chainDateIso(doc.week_start) || '');
    setWorkshop(initialWorkshop(doc));
    setComment(doc.comment || '');
    setDirty(false);
  }, [
    doc.id,
    doc.status,
    doc.actual_week_start,
    doc.week_start,
    doc.workshop,
    doc.comment,
    doc.section_id,
    doc.updated_at,
  ]);

  const planIso = chainDateIso(doc.week_start);
  const moved = planIso && actualWeek && planIso !== actualWeek;

  const order = doc.Order;
  const photoUrl = firstPhotoUrl(order);
  const article = String(order?.article || order?.tz_code || '').trim();
  const titleLine = String(order?.title || order?.model_name || '').trim();
  const nameLine = article && titleLine ? `${article} — ${titleLine}` : article || titleLine || `Заказ #${doc.order_id}`;

  const handleSaveClick = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      await onSave(doc.id, {
        status,
        actual_week_start: actualWeek,
        workshop: workshop || null,
        comment: comment.trim() || null,
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="plan-doc-card">
      <div className="plan-doc-card-header">
        <div className="plan-doc-photo">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }}
            />
          ) : (
            <div className="plan-doc-photo-placeholder">нет фото</div>
          )}
        </div>
        <div className="plan-doc-title">
          <Link to="/production-chain" className="plan-doc-name">
            {nameLine}
          </Link>
          <span className="plan-doc-id">#{doc.order_id}</span>
        </div>
      </div>

      <div className="plan-doc-divider" />

      <div className="plan-doc-body">
        <div className="plan-doc-row">
          <div className="plan-doc-field">
            <label>Неделя план</label>
            <span className="plan-doc-field-value">{formatWeekRangeLabel(doc.week_start)}</span>
          </div>
          <div className="plan-doc-field">
            <label>Статус</label>
            <select
              value={status}
              disabled={!canEdit}
              onChange={(e) => {
                setStatus(e.target.value);
                setDirty(true);
              }}
              className={`plan-doc-status-select plan-doc-status-${status}`}
            >
              <option value="pending">Не начато</option>
              <option value="in_progress">В процессе</option>
              <option value="done">Завершено</option>
            </select>
          </div>
        </div>

        <div className="plan-doc-row">
          <div className="plan-doc-field">
            <label>Дата план</label>
            <span className="plan-doc-field-value">{formatDateRu(doc.week_start)}</span>
          </div>
        </div>

        <div className="plan-doc-row">
          <div className="plan-doc-field">
            <label>Дата факт</label>
            <select
              value={actualWeek}
              disabled={!canEdit}
              onChange={(e) => {
                setActualWeek(e.target.value);
                setDirty(true);
              }}
              className={moved ? 'plan-doc-select-moved' : ''}
            >
              {weeks.map((w) => (
                <option key={w.start} value={w.start}>
                  {formatDateRu(w.start)} ({w.label})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="plan-doc-row">
          <div className="plan-doc-field">
            <label>Цех</label>
            <select
              value={workshop}
              disabled={!canEdit}
              onChange={(e) => {
                setWorkshop(e.target.value);
                setDirty(true);
              }}
            >
              {WORKSHOP_OPTIONS.map((o) => (
                <option key={o.value || 'empty'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="plan-doc-row">
          <div className="plan-doc-field plan-doc-field-full">
            <label>Комментарий</label>
            <input
              type="text"
              value={comment}
              disabled={!canEdit}
              placeholder="Добавить комментарий..."
              onChange={(e) => {
                setComment(e.target.value);
                setDirty(true);
              }}
            />
          </div>
        </div>
      </div>

      {dirty && canEdit && (
        <div className="plan-doc-footer">
          <button type="button" className="plan-doc-save-btn" disabled={saving} onClick={handleSaveClick}>
            {saving ? '…' : 'Сохранить'}
          </button>
        </div>
      )}
    </div>
  );
}
