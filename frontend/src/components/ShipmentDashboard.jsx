import { useState, useEffect } from 'react';

export default function ShipmentDashboard({ orders = [], receptions = [] }) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const notifs = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    orders.forEach((order) => {
      const deadline = order.deadline || order.plan_date || order.delivery_date;
      if (!deadline) return;

      const deadlineDate = new Date(deadline);
      deadlineDate.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));

      if (daysLeft <= 3 && daysLeft >= 0) {
        notifs.push({
          id: `deadline_${order.id}`,
          type: 'warning',
          icon: '⚠️',
          title: `Срок сдачи через ${daysLeft} дн.`,
          text: `${order.number || order.tz_code} — ${
            order.product_name || order.model_name || order.title || order.name
          }`,
          color: '#fbbf24',
        });
      }

      if (daysLeft < 0) {
        notifs.push({
          id: `overdue_${order.id}`,
          type: 'danger',
          icon: '🔴',
          title: `Просрочен на ${Math.abs(daysLeft)} дн.`,
          text: `${order.number || order.tz_code} — ${
            order.product_name || order.model_name || order.title || order.name
          }`,
          color: '#f87171',
        });
      }
    });

    receptions.forEach((rec) => {
      const defects = parseInt(rec.defect_count || 0, 10);
      if (defects > 0) {
        notifs.push({
          id: `defect_${rec.id}`,
          type: 'defect',
          icon: '❌',
          title: `Брак: ${defects} шт`,
          text: `${rec.order_number} — ${rec.defect_type || 'Не указан тип'}`,
          color: '#f87171',
        });
      }
    });

    setNotifications(notifs);
  }, [orders, receptions]);

  const totalOrders = orders.length;
  const activeOrders = orders.filter(
    (o) => o.status === 'active' || o.status === 'in_progress'
  ).length;
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
          marginBottom: 24,
        }}
      >
        {[
          { label: 'Всего заказов', value: totalOrders, color: '#93c5fd', icon: '📦' },
          { label: 'Активных', value: activeOrders, color: '#fbbf24', icon: '⚡' },
          { label: 'Принято на склад', value: totalAccepted, color: '#4ade80', icon: '✅' },
          { label: 'Брак всего', value: totalDefects, color: '#f87171', icon: '❌' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: '#0a1628',
              border: `1px solid ${s.color}44`,
              borderRadius: 12,
              padding: '20px 16px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: '#0a1628',
          border: '1px solid #1e3a5f',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            color: '#e2e8f0',
            fontWeight: 700,
            fontSize: 14,
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          🔔 Уведомления
          {notifications.length > 0 ? (
            <span
              style={{
                background: '#f87171',
                color: '#fff',
                borderRadius: 10,
                padding: '1px 8px',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {notifications.length}
            </span>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <div
            style={{
              color: '#4ade80',
              fontSize: 13,
              textAlign: 'center',
              padding: '16px 0',
            }}
          >
            ✅ Нет активных уведомлений
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notifications.map((n) => (
              <div
                key={n.id}
                style={{
                  background: `${n.color}11`,
                  border: `1px solid ${n.color}44`,
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 18 }}>{n.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: n.color, fontWeight: 600, fontSize: 13 }}>{n.title}</div>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{n.text}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          background: '#0a1628',
          border: '1px solid #1e3a5f',
          borderRadius: 12,
          padding: '16px 20px',
        }}
      >
        <div
          style={{
            color: '#e2e8f0',
            fontWeight: 700,
            fontSize: 14,
            marginBottom: 12,
          }}
        >
          📋 Последние приёмки
        </div>
        {receptions.slice(0, 5).map((rec) => (
          <div
            key={rec.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '1px solid #1e2a3a',
            }}
          >
            <div>
              <span style={{ color: '#a3e635', fontWeight: 600, fontSize: 13 }}>
                {rec.order_number}
              </span>
              <span style={{ color: '#64748b', fontSize: 11, marginLeft: 8 }}>
                {rec.reception_date
                  ? new Date(rec.reception_date).toLocaleDateString('ru-RU')
                  : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: '#4ade80', fontSize: 12, fontWeight: 600 }}>
                ✅ {rec.accepted_count}
              </span>
              {parseInt(rec.defect_count || 0, 10) > 0 ? (
                <span style={{ color: '#f87171', fontSize: 12, fontWeight: 600 }}>
                  ❌ {rec.defect_count}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        {receptions.length === 0 ? (
          <div
            style={{
              color: '#64748b',
              fontSize: 13,
              textAlign: 'center',
              padding: '16px 0',
            }}
          >
            Приёмок пока нет
          </div>
        ) : null}
      </div>
    </div>
  );
}
