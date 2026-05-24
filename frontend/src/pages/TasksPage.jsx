/**
 * Задачи и Решения — канбан и дашборд
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import useIsMobile from '../hooks/useIsMobile';

const STAGES = ['Закуп', 'Раскрой', 'Пошив', 'ОТК', 'Отгрузка'];

const STATUSES = [
  { key: 'new', label: 'Новая', color: '#3b82f6', bg: '#1e3a5f' },
  { key: 'in_progress', label: 'В работе', color: '#fbbf24', bg: '#2a1a00' },
  { key: 'resolved', label: 'Решено', color: '#4ade80', bg: '#0a2a0a' },
  { key: 'closed', label: 'Закрыто', color: '#64748b', bg: '#1a1a2e' },
];

const LABEL = {
  display: 'block',
  color: '#94a3b8',
  fontSize: 12,
  marginBottom: 6,
  marginTop: 12,
  fontWeight: 600,
};

const INPUT = {
  width: '100%',
  background: '#1e2a3a',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  boxSizing: 'border-box',
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRuDate(iso) {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU');
}

function orderLabel(o) {
  const tz = String(o?.tz_code || o?.article || o?.number || '').trim();
  const name = String(o?.model_name || o?.title || o?.name || '').trim();
  if (tz && name) return `${tz} — ${name}`;
  return tz || name || `Заказ #${o?.id}`;
}

export default function TasksPage() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('kanban');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [orders, setOrders] = useState([]);

  const [form, setForm] = useState({
    order_id: '',
    order_number: '',
    from_stage: '',
    to_stage: '',
    date_start: todayIso(),
    date_end: '',
    description: '',
    photo: null,
    status: 'new',
  });

  const loadTasks = useCallback(() => {
    setLoading(true);
    api.tasks
      .list()
      .then((data) => {
        setTasks(Array.isArray(data) ? data : []);
      })
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    api.orders
      .list({ limit: 200, light: '1' })
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.rows ?? data?.orders ?? [];
        setOrders(Array.isArray(list) ? list : []);
      })
      .catch(() => setOrders([]));
  }, []);

  const handleSubmit = async () => {
    console.log('[DEBUG submit] form:', form);
    console.log('[DEBUG submit] photo:', form.photo);

    if (!form.from_stage || !form.to_stage) {
      alert('⚠️ Выберите отделы "откуда" и "куда"');
      return;
    }

    try {
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'photo') {
          if (v) formData.append('photo', v);
          return;
        }
        if (v !== null && v !== undefined && v !== '') {
          formData.append(k, v);
        }
      });

      console.log('[DEBUG] FormData entries:');
      for (const [k, v] of formData.entries()) {
        console.log(' ', k, '=', v);
      }

      const created = await api.tasks.create(formData);
      console.log('[DEBUG] response:', created);

      setTasks((prev) => [created, ...prev]);
      setShowForm(false);
      setForm({
        order_id: '',
        order_number: '',
        from_stage: '',
        to_stage: '',
        date_start: todayIso(),
        date_end: '',
        description: '',
        photo: null,
        status: 'new',
      });
      alert('✅ Задача зафиксирована!');
    } catch (err) {
      console.error('[DEBUG submit error]:', err);
      alert(`❌ Ошибка: ${err?.error || err?.message || 'не удалось сохранить'}`);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      const updated = await api.tasks.update(taskId, { status: newStatus });
      setTasks((prev) =>
        prev.map((t) => (Number(t.id) === Number(taskId) ? { ...t, ...updated } : t))
      );
    } catch (err) {
      alert(err?.message || 'Не удалось обновить статус');
    }
  };

  return (
    <div
      style={{
        padding: '24px',
        background: '#020b18',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1 style={{ color: '#e2e8f0', fontSize: 24, fontWeight: 700, margin: 0 }}>
          📋 Задачи и Решения
        </h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            background: '#a3e635',
            color: '#000',
            border: 'none',
            borderRadius: 8,
            padding: '10px 20px',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          + Зафиксировать задачу
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { key: 'kanban', label: '🗂 Канбан' },
          { key: 'dashboard', label: '📊 Дашборд' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              background: tab === t.key ? '#a3e635' : '#0f172a',
              color: tab === t.key ? '#000' : '#94a3b8',
              border: '1px solid',
              borderColor: tab === t.key ? '#a3e635' : '#1e3a5f',
              borderRadius: 8,
              padding: '8px 20px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: tab === t.key ? 700 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>Загрузка задач...</p>
      ) : null}

      {!loading && tab === 'kanban' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
            gap: 12,
          }}
        >
          {STATUSES.map((status) => {
            const colTasks = tasks.filter((t) => t.status === status.key);
            return (
              <div
                key={status.key}
                style={{
                  background: '#0a1628',
                  border: `1px solid ${status.color}44`,
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    background: status.bg,
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: `1px solid ${status.color}44`,
                  }}
                >
                  <span style={{ color: status.color, fontWeight: 700, fontSize: 13 }}>
                    {status.label}
                  </span>
                  <span
                    style={{
                      background: '#000000aa',
                      color: status.color,
                      borderRadius: 10,
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {colTasks.length}
                  </span>
                </div>

                <div
                  style={{
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    minHeight: 200,
                    maxHeight: 'calc(100vh - 280px)',
                    overflowY: 'auto',
                  }}
                >
                  {colTasks.length === 0 && (
                    <div
                      style={{
                        color: '#2d3748',
                        fontSize: 12,
                        textAlign: 'center',
                        padding: '20px 0',
                      }}
                    >
                      Нет задач
                    </div>
                  )}

                  {colTasks.map((task) => {
                    return (
                      <div
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedTask(task)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedTask(task);
                          }
                        }}
                        style={{
                          background: '#0f172a',
                          border: '1px solid #1e3a5f',
                          borderRadius: 8,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#a3e635';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#1e3a5f';
                        }}
                      >
                        {task.photo_url ? (
                          <img
                            src={task.photo_url}
                            alt=""
                            style={{
                              width: '100%',
                              height: 100,
                              objectFit: 'cover',
                              display: 'block',
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : null}

                        <div style={{ padding: '8px 10px' }}>
                          <div
                            style={{
                              color: '#a3e635',
                              fontWeight: 700,
                              fontSize: 12,
                              marginBottom: 4,
                            }}
                          >
                            {task.order_number || '—'}
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              marginBottom: 6,
                              flexWrap: 'wrap',
                            }}
                          >
                            <span
                              style={{
                                background: '#1e3a5f',
                                color: '#93c5fd',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                              }}
                            >
                              {task.from_stage}
                            </span>
                            <span style={{ color: '#475569', fontSize: 10 }}>→</span>
                            <span
                              style={{
                                background: '#2a1a3a',
                                color: '#d8b4fe',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                              }}
                            >
                              {task.to_stage}
                            </span>
                          </div>

                          {task.description ? (
                            <div
                              style={{
                                color: '#94a3b8',
                                fontSize: 11,
                                marginBottom: 6,
                                lineHeight: 1.4,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {task.description}
                            </div>
                          ) : null}

                          <div
                            style={{
                              color: '#475569',
                              fontSize: 10,
                              marginBottom: 8,
                            }}
                          >
                            📅 {formatRuDate(task.date_start)}
                            {task.date_end ? ` → ${formatRuDate(task.date_end)}` : ''}
                          </div>

                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {STATUSES.filter((s) => s.key !== task.status).map((s) => (
                              <button
                                key={s.key}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(task.id, s.key);
                                }}
                                style={{
                                  background: s.bg,
                                  color: s.color,
                                  border: `1px solid ${s.color}44`,
                                  borderRadius: 4,
                                  padding: '3px 8px',
                                  cursor: 'pointer',
                                  fontSize: 10,
                                  fontWeight: 600,
                                }}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedTask ? (
        <>
          <div
            role="presentation"
            onClick={() => setSelectedTask(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              zIndex: 1000,
            }}
          />

          <div
            className={isMobile ? 'modal-mobile' : undefined}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1001,
              background: '#0f172a',
              border: '1px solid #1e3a5f',
              borderRadius: 14,
              width: 560,
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
            }}
          >
            <div
              style={{
                background: '#1a237e',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderRadius: '14px 14px 0 0',
              }}
            >
              <div>
                <div style={{ color: '#a3e635', fontSize: 16, fontWeight: 700 }}>
                  📋 Задача #{selectedTask.id}
                </div>
                <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                  {(selectedTask.created_at || selectedTask.createdAt) &&
                    new Date(selectedTask.created_at || selectedTask.createdAt).toLocaleString(
                      'ru-RU'
                    )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                style={{
                  background: '#ffffff22',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {selectedTask.photo_url ? (
                <div style={{ marginBottom: 20 }}>
                  <img
                    src={selectedTask.photo_url}
                    alt=""
                    style={{
                      width: '100%',
                      maxHeight: 320,
                      objectFit: 'contain',
                      borderRadius: 10,
                      background: '#050d1a',
                      cursor: 'zoom-in',
                    }}
                    onClick={() => {
                      window.open(selectedTask.photo_url, '_blank');
                    }}
                  />
                  <div
                    style={{
                      color: '#475569',
                      fontSize: 10,
                      textAlign: 'center',
                      marginTop: 4,
                    }}
                  >
                    Нажмите на фото для увеличения
                  </div>
                </div>
              ) : null}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    background: '#0a1628',
                    border: '1px solid #1e3a5f',
                    borderRadius: 8,
                    padding: '12px',
                  }}
                >
                  <div
                    style={{
                      color: '#64748b',
                      fontSize: 10,
                      marginBottom: 4,
                      fontWeight: 600,
                    }}
                  >
                    ТЗ ЗАКАЗА
                  </div>
                  <div style={{ color: '#a3e635', fontSize: 15, fontWeight: 700 }}>
                    {selectedTask.order_number || '—'}
                  </div>
                </div>

                <div
                  style={{
                    background: '#0a1628',
                    border: '1px solid #1e3a5f',
                    borderRadius: 8,
                    padding: '12px',
                  }}
                >
                  <div
                    style={{
                      color: '#64748b',
                      fontSize: 10,
                      marginBottom: 4,
                      fontWeight: 600,
                    }}
                  >
                    СТАТУС
                  </div>
                  {(() => {
                    const st = STATUSES.find((s) => s.key === selectedTask.status);
                    return (
                      <span
                        style={{
                          background: st?.bg,
                          color: st?.color,
                          padding: '4px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {st?.label}
                      </span>
                    );
                  })()}
                </div>

                <div
                  style={{
                    background: '#0a1628',
                    border: '1px solid #1e3a5f',
                    borderRadius: 8,
                    padding: '12px',
                  }}
                >
                  <div
                    style={{
                      color: '#64748b',
                      fontSize: 10,
                      marginBottom: 4,
                      fontWeight: 600,
                    }}
                  >
                    КАКОЙ ОТДЕЛ
                  </div>
                  <span
                    style={{
                      background: '#1e3a5f',
                      color: '#93c5fd',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {selectedTask.from_stage || '—'}
                  </span>
                </div>

                <div
                  style={{
                    background: '#0a1628',
                    border: '1px solid #1e3a5f',
                    borderRadius: 8,
                    padding: '12px',
                  }}
                >
                  <div
                    style={{
                      color: '#64748b',
                      fontSize: 10,
                      marginBottom: 4,
                      fontWeight: 600,
                    }}
                  >
                    К КАКОМУ ОТДЕЛУ
                  </div>
                  <span
                    style={{
                      background: '#2a1a3a',
                      color: '#d8b4fe',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {selectedTask.to_stage || '—'}
                  </span>
                </div>

                <div
                  style={{
                    background: '#0a1628',
                    border: '1px solid #1e3a5f',
                    borderRadius: 8,
                    padding: '12px',
                  }}
                >
                  <div
                    style={{
                      color: '#64748b',
                      fontSize: 10,
                      marginBottom: 4,
                      fontWeight: 600,
                    }}
                  >
                    ДАТА ФИКСАЦИИ
                  </div>
                  <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                    {formatRuDate(selectedTask.date_start) || '—'}
                  </div>
                </div>

                <div
                  style={{
                    background: '#0a1628',
                    border: '1px solid #1e3a5f',
                    borderRadius: 8,
                    padding: '12px',
                  }}
                >
                  <div
                    style={{
                      color: '#64748b',
                      fontSize: 10,
                      marginBottom: 4,
                      fontWeight: 600,
                    }}
                  >
                    ДО КАКОЙ ДАТЫ
                  </div>
                  <div
                    style={{
                      color: selectedTask.date_end ? '#fbbf24' : '#475569',
                      fontSize: 13,
                      fontWeight: selectedTask.date_end ? 600 : 400,
                    }}
                  >
                    {formatRuDate(selectedTask.date_end) || '—'}
                  </div>
                </div>
              </div>

              {selectedTask.description ? (
                <div
                  style={{
                    background: '#0a1628',
                    border: '1px solid #1e3a5f',
                    borderRadius: 8,
                    padding: '14px',
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      color: '#64748b',
                      fontSize: 10,
                      marginBottom: 8,
                      fontWeight: 600,
                    }}
                  >
                    ОПИСАНИЕ ЗАДАЧИ
                  </div>
                  <div
                    style={{
                      color: '#e2e8f0',
                      fontSize: 13,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {selectedTask.description}
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {STATUSES.filter((s) => s.key !== selectedTask.status).map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      handleStatusChange(selectedTask.id, s.key);
                      setSelectedTask((prev) => (prev ? { ...prev, status: s.key } : prev));
                    }}
                    style={{
                      background: s.bg,
                      color: s.color,
                      border: `1px solid ${s.color}66`,
                      borderRadius: 8,
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    → {s.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  style={{
                    marginLeft: 'auto',
                    background: '#1e2a3a',
                    color: '#64748b',
                    border: '1px solid #374151',
                    borderRadius: 8,
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {!loading && tab === 'dashboard' && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            {STATUSES.map((s) => (
              <div
                key={s.key}
                style={{
                  background: '#0a1628',
                  border: `1px solid ${s.color}44`,
                  borderRadius: 12,
                  padding: '20px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>
                  {tasks.filter((t) => t.status === s.key).length}
                </div>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              background: '#0a1628',
              border: '1px solid #1e3a5f',
              borderRadius: 12,
              padding: '20px',
              marginBottom: 16,
            }}
          >
            <div style={{ color: '#a3e635', fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
              📦 Задачи по отделам
            </div>
            {STAGES.map((stage) => {
              const count = tasks.filter(
                (t) => t.from_stage === stage || t.to_stage === stage
              ).length;
              const open = tasks.filter(
                (t) =>
                  (t.from_stage === stage || t.to_stage === stage) &&
                  t.status !== 'closed' &&
                  t.status !== 'resolved'
              ).length;
              return (
                <div
                  key={stage}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ color: '#e2e8f0', fontSize: 13, width: 80 }}>{stage}</div>
                  <div
                    style={{
                      flex: 1,
                      background: '#1e2a3a',
                      borderRadius: 4,
                      height: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        background: open > 0 ? '#f87171' : '#4ade80',
                        borderRadius: 4,
                        width: tasks.length > 0 ? `${(count / tasks.length) * 100}%` : '0%',
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      color: open > 0 ? '#f87171' : '#4ade80',
                      fontSize: 12,
                      fontWeight: 600,
                      minWidth: 60,
                      textAlign: 'right',
                    }}
                  >
                    {open > 0 ? `${open} открыто` : `${count} всего`}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              background: '#0a1628',
              border: '1px solid #1e3a5f',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1a237e' }}>
                  {['Фото', 'ТЗ заказа', 'Откуда→Куда', 'Описание', 'Период', 'Статус'].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: '10px 12px',
                          textAlign: 'left',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>
                      Нет задач — нажмите «Зафиксировать задачу»
                    </td>
                  </tr>
                ) : (
                  tasks.map((task, i) => {
                    const st = STATUSES.find((s) => s.key === task.status);
                    return (
                      <tr
                        key={task.id}
                        style={{
                          background: i % 2 === 0 ? '#0a1020' : '#0f172a',
                          borderBottom: '1px solid #111',
                        }}
                      >
                        <td style={{ padding: '8px 12px' }}>
                          {task.photo_url ? (
                            <img
                              src={task.photo_url}
                              alt=""
                              style={{
                                width: 40,
                                height: 40,
                                objectFit: 'cover',
                                borderRadius: 6,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                background: '#1e2a3a',
                                borderRadius: 6,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 18,
                              }}
                            >
                              📋
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#a3e635', fontWeight: 700 }}>
                          {task.order_number || '—'}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ color: '#93c5fd', fontSize: 11 }}>{task.from_stage}</span>
                          <span style={{ color: '#475569', margin: '0 4px' }}>→</span>
                          <span style={{ color: '#d8b4fe', fontSize: 11 }}>{task.to_stage}</span>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8', maxWidth: 200 }}>
                          {(task.description || '').slice(0, 60)}
                          {(task.description || '').length > 60 ? '...' : ''}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            color: '#64748b',
                            fontSize: 11,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatRuDate(task.date_start)}
                          {task.date_end ? (
                            <>
                              <br />→ {formatRuDate(task.date_end)}
                            </>
                          ) : null}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span
                            style={{
                              background: st?.bg,
                              color: st?.color,
                              padding: '3px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {st?.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm ? (
        <>
          <div
            role="presentation"
            onClick={() => setShowForm(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 1000,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1001,
              background: '#0f172a',
              border: '1px solid #1e3a5f',
              borderRadius: 12,
              padding: '24px',
              width: 520,
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <div style={{ color: '#a3e635', fontSize: 16, fontWeight: 700 }}>
                📋 Фиксация задачи
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <label style={LABEL}>ТЗ заказа</label>
            <select
              value={form.order_id}
              onChange={(e) => {
                const o = orders.find((x) => String(x.id) === String(e.target.value));
                setForm((f) => ({
                  ...f,
                  order_id: e.target.value,
                  order_number: o ? orderLabel(o) : '',
                }));
              }}
              style={INPUT}
            >
              <option value="">— Выберите заказ —</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {orderLabel(o)}
                </option>
              ))}
            </select>

            <label style={LABEL}>Какой отдел (откуда задача)</label>
            <select
              value={form.from_stage}
              onChange={(e) => setForm((f) => ({ ...f, from_stage: e.target.value }))}
              style={INPUT}
            >
              <option value="">— Выбрать —</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <label style={LABEL}>К какому отделу (кому задача)</label>
            <select
              value={form.to_stage}
              onChange={(e) => setForm((f) => ({ ...f, to_stage: e.target.value }))}
              style={INPUT}
            >
              <option value="">— Выбрать —</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL}>Дата фиксации</label>
                <input
                  type="date"
                  value={form.date_start}
                  onChange={(e) => setForm((f) => ({ ...f, date_start: e.target.value }))}
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LABEL}>До какой даты</label>
                <input
                  type="date"
                  value={form.date_end}
                  onChange={(e) => setForm((f) => ({ ...f, date_end: e.target.value }))}
                  style={INPUT}
                />
              </div>
            </div>

            <label style={LABEL}>Описание задачи</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Опишите проблему или задачу..."
              rows={4}
              style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit' }}
            />

            <label style={LABEL}>Фото (с телефона или камеры)</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) =>
                setForm((f) => ({ ...f, photo: e.target.files?.[0] || null }))
              }
              style={{ display: 'none' }}
              id="task-photo-input"
            />
            <label
              htmlFor="task-photo-input"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#1e2a3a',
                border: '2px dashed #374151',
                borderRadius: 8,
                padding: '16px',
                cursor: 'pointer',
                marginBottom: 16,
                color: '#64748b',
                fontSize: 13,
              }}
            >
              📷 {form.photo ? form.photo.name : 'Нажмите чтобы добавить фото'}
            </label>

            {form.photo ? (
              <img
                src={URL.createObjectURL(form.photo)}
                alt=""
                style={{
                  width: '100%',
                  maxHeight: 200,
                  objectFit: 'cover',
                  borderRadius: 8,
                  marginBottom: 16,
                }}
              />
            ) : null}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleSubmit}
                style={{
                  flex: 1,
                  background: '#a3e635',
                  color: '#000',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                ✅ Зафиксировать
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
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
        </>
      ) : null}
    </div>
  );
}
