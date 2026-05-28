import { useState, useEffect } from 'react';
import { api } from '../api';

const DEFECT_TYPES = [
  'Брак пошива',
  'Брак ткани',
  'Брак фурнитуры',
  'Несоответствие размера',
  'Загрязнение',
  'Механическое повреждение',
  'Прочее',
];

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

const emptyForm = () => ({
  order_id: '',
  order_number: '',
  order_name: '',
  reception_date: new Date().toISOString().split('T')[0],
  total_received: '',
  defect_count: '',
  defect_type: '',
  defect_note: '',
  accepted_count: '',
  status: 'accepted',
  photos: [],
});

export default function ReceptionTab({ onSaved }) {
  const [receptions, setReceptions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [fullPhoto, setFullPhoto] = useState(null);

  const compressImage = (file) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX = 1200;
          let w = img.width;
          let h = img.height;
          if (w > h && w > MAX) {
            h = Math.round((h * MAX) / w);
            w = MAX;
          } else if (h > MAX) {
            w = Math.round((w * MAX) / h);
            h = MAX;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result || '');
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.75));
        };
        img.src = e.target?.result;
      };
      reader.readAsDataURL(file);
    });

  const handleAddPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const compressed = await Promise.all(files.map((f) => compressImage(f)));

    setForm((f) => ({
      ...f,
      photos: [...f.photos, ...compressed.filter(Boolean)],
    }));

    e.target.value = '';
  };

  const removePhoto = (index) => {
    setForm((f) => ({
      ...f,
      photos: f.photos.filter((_, i) => i !== index),
    }));
  };

  const loadReceptions = () => {
    api
      .get('/api/receptions')
      .then((rows) => setReceptions(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  };

  useEffect(() => {
    loadReceptions();
    api.orders
      .list({ limit: 200 })
      .then((r) => {
        const list = r?.orders || r?.rows || r || [];
        setOrders(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!form.order_number) {
      alert('⚠️ Выберите заказ');
      return;
    }
    if (!form.total_received) {
      alert('⚠️ Укажите количество принятых');
      return;
    }
    try {
      const accepted =
        parseInt(form.total_received, 10) - parseInt(form.defect_count || 0, 10);
      const item = await api.post('/api/receptions', {
        ...form,
        order_id: form.order_id ? parseInt(form.order_id, 10) : null,
        accepted_count: accepted,
        photos: form.photos,
      });
      setReceptions((prev) => [item, ...prev]);
      setShowForm(false);
      setForm(emptyForm());
      if (typeof onSaved === 'function') onSaved(item);
    } catch (err) {
      alert(`❌ Ошибка: ${err.message}`);
    }
  };

  const totalDefects = receptions.reduce(
    (s, r) => s + parseInt(r.defect_count || 0, 10),
    0
  );
  const totalAccepted = receptions.reduce(
    (s, r) => s + parseInt(r.accepted_count || 0, 10),
    0
  );

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'Всего приёмок', value: receptions.length, color: '#93c5fd' },
          { label: 'Принято (шт)', value: totalAccepted, color: '#4ade80' },
          { label: 'Брак (шт)', value: totalDefects, color: '#f87171' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: '#0a1628',
              border: `1px solid ${s.color}44`,
              borderRadius: 10,
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 16,
        }}
      >
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
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          + Добавить приёмку
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {receptions.length === 0 ? (
          <div
            style={{
              color: '#64748b',
              textAlign: 'center',
              padding: '40px 20px',
              fontSize: 14,
            }}
          >
            <div style={{ fontSize: 32 }}>📭</div>
            <div style={{ marginTop: 8 }}>Приёмок пока нет</div>
          </div>
        ) : (
          receptions.map((rec) => (
            <div
              key={rec.id}
              style={{
                background: '#0a1628',
                border:
                  parseInt(rec.defect_count || 0, 10) > 0
                    ? '1px solid #f87171'
                    : '1px solid #1e3a5f',
                borderRadius: 10,
                padding: '14px 16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <div>
                  <div style={{ color: '#a3e635', fontWeight: 700, fontSize: 14 }}>
                    {rec.order_number}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                    {rec.order_name}
                  </div>
                  <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>
                    📅{' '}
                    {rec.reception_date
                      ? new Date(rec.reception_date).toLocaleDateString('ru-RU')
                      : '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 15 }}>
                    ✅ {rec.accepted_count} шт
                  </div>
                  {parseInt(rec.defect_count || 0, 10) > 0 && (
                    <div
                      style={{
                        color: '#f87171',
                        fontWeight: 700,
                        fontSize: 13,
                        marginTop: 4,
                      }}
                    >
                      ❌ Брак: {rec.defect_count} шт
                    </div>
                  )}
                </div>
              </div>

              {parseInt(rec.defect_count || 0, 10) > 0 && (
                <div
                  style={{
                    background: '#1a0505',
                    border: '1px solid #f8717144',
                    borderRadius: 6,
                    padding: '8px 12px',
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      color: '#f87171',
                      fontSize: 11,
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    ⚠️ Тип брака: {rec.defect_type}
                  </div>
                  {rec.defect_note && (
                    <div style={{ color: '#94a3b8', fontSize: 11 }}>{rec.defect_note}</div>
                  )}
                </div>
              )}

              {(() => {
                const photos = Array.isArray(rec.photos)
                  ? rec.photos
                  : (() => {
                      try {
                        return JSON.parse(rec.photos || '[]');
                      } catch {
                        return [];
                      }
                    })();
                if (!photos.length) return null;
                return (
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      marginTop: 8,
                      marginBottom: 8,
                    }}
                  >
                    {photos.map((photo, i) => (
                      <img
                        key={i}
                        src={photo}
                        alt=""
                        onClick={() => setFullPhoto(photo)}
                        style={{
                          width: 60,
                          height: 60,
                          objectFit: 'cover',
                          borderRadius: 6,
                          border: '1px solid #1e3a5f',
                          cursor: 'zoom-in',
                        }}
                      />
                    ))}
                  </div>
                );
              })()}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    flex: 1,
                    background: '#1e2a3a',
                    borderRadius: 4,
                    height: 6,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      background: '#4ade80',
                      borderRadius: 4,
                      width:
                        rec.total_received > 0
                          ? `${(rec.accepted_count / rec.total_received) * 100}%`
                          : '0%',
                    }}
                  />
                </div>
                <div style={{ color: '#64748b', fontSize: 10, whiteSpace: 'nowrap' }}>
                  {rec.accepted_count}/{rec.total_received} шт
                </div>
              </div>
            </div>
          ))
        )}
      </div>

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
              transform: 'translate(-50%,-50%)',
              zIndex: 1001,
              background: '#0f172a',
              border: '1px solid #a3e635',
              borderRadius: 14,
              padding: '24px',
              width: 520,
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
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
                📦 Приёмка товара
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 20,
                }}
              >
                ✕
              </button>
            </div>

            <label style={LABEL}>Заказ</label>
            <select
              value={form.order_id}
              onChange={(e) => {
                const o = orders.find((x) => String(x.id) === String(e.target.value));
                setForm((f) => ({
                  ...f,
                  order_id: e.target.value,
                  order_number: o?.number || o?.tz_code || '',
                  order_name: o?.product_name || o?.model_name || o?.title || o?.name || '',
                }));
              }}
              style={INPUT}
            >
              <option value="">— Выберите заказ —</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.number || o.tz_code} — {o.product_name || o.model_name || o.title || o.name}
                </option>
              ))}
            </select>

            <label style={LABEL}>Дата приёмки</label>
            <input
              type="date"
              value={form.reception_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, reception_date: e.target.value }))
              }
              style={INPUT}
            />

            <label style={LABEL}>Принято всего (шт)</label>
            <input
              type="number"
              value={form.total_received}
              onChange={(e) =>
                setForm((f) => ({ ...f, total_received: e.target.value }))
              }
              placeholder="0"
              style={{ ...INPUT, color: '#4ade80', fontWeight: 700 }}
            />

            <label style={LABEL}>Брак (шт) — если есть</label>
            <input
              type="number"
              value={form.defect_count}
              onChange={(e) => setForm((f) => ({ ...f, defect_count: e.target.value }))}
              placeholder="0"
              style={{ ...INPUT, color: '#f87171', fontWeight: 700 }}
            />

            {form.total_received ? (
              <div
                style={{
                  background: '#0a2a0a',
                  border: '1px solid #16a34a',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginTop: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: '#4ade80', fontSize: 12 }}>Принято к складу:</span>
                <span style={{ color: '#4ade80', fontWeight: 700 }}>
                  {parseInt(form.total_received || 0, 10) -
                    parseInt(form.defect_count || 0, 10)}{' '}
                  шт
                </span>
              </div>
            ) : null}

            {parseInt(form.defect_count || 0, 10) > 0 ? (
              <>
                <label style={LABEL}>Тип брака</label>
                <select
                  value={form.defect_type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, defect_type: e.target.value }))
                  }
                  style={INPUT}
                >
                  <option value="">— Выберите тип —</option>
                  {DEFECT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <label style={LABEL}>Описание брака</label>
                <textarea
                  value={form.defect_note}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, defect_note: e.target.value }))
                  }
                  placeholder="Опишите дефект..."
                  rows={3}
                  style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </>
            ) : null}

            <label style={LABEL}>📷 Фото приёмки (несколько)</label>

            <div style={{ marginBottom: 10 }}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                id="reception-photos"
                onChange={handleAddPhotos}
                style={{ display: 'none' }}
              />

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <label
                  htmlFor="reception-photos"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#1e3a5f',
                    color: '#93c5fd',
                    border: '2px dashed #1e3a5f',
                    borderRadius: 8,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  📷 Сфотографировать
                </label>

                <label
                  htmlFor="reception-photos-gallery"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#1e2a3a',
                    color: '#64748b',
                    border: '2px dashed #374151',
                    borderRadius: 8,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  🖼️ Из галереи
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  id="reception-photos-gallery"
                  onChange={handleAddPhotos}
                  style={{ display: 'none' }}
                />
              </div>
            </div>

            {form.photos.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {form.photos.map((photo, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'relative',
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: '1px solid #1e3a5f',
                    }}
                  >
                    <img
                      src={photo}
                      alt=""
                      style={{
                        width: '100%',
                        height: 100,
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        background: '#dc2626cc',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        width: 22,
                        height: 22,
                        cursor: 'pointer',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                      }}
                    >
                      ✕
                    </button>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: '#000000aa',
                        color: '#fff',
                        fontSize: 10,
                        padding: '2px 4px',
                        textAlign: 'center',
                      }}
                    >
                      Фото {i + 1}
                    </div>
                  </div>
                ))}

                <label
                  htmlFor="reception-photos"
                  style={{
                    height: 100,
                    border: '2px dashed #374151',
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#475569',
                    fontSize: 24,
                    gap: 4,
                  }}
                >
                  <span>+</span>
                  <span style={{ fontSize: 10 }}>Добавить</span>
                </label>
              </div>
            ) : null}

            {form.photos.length > 0 ? (
              <div
                style={{
                  color: '#64748b',
                  fontSize: 11,
                  marginBottom: 12,
                }}
              >
                📷 Добавлено фото: {form.photos.length}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={handleSave}
                style={{
                  flex: 1,
                  background: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                ✅ Сохранить приёмку
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
      {fullPhoto ? (
        <div
          onClick={() => setFullPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.95)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={fullPhoto}
            alt=""
            style={{
              maxWidth: '95vw',
              maxHeight: '95vh',
              objectFit: 'contain',
              borderRadius: 8,
            }}
          />
          <button
            type="button"
            onClick={() => setFullPhoto(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: '#ffffff22',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: 40,
              height: 40,
              cursor: 'pointer',
              fontSize: 20,
            }}
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
