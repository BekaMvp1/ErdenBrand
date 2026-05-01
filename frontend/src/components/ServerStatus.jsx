import { useEffect, useState } from 'react';
import api from '../api';

export default function ServerStatus() {
  const [status, setStatus] = useState('checking'); // checking | ok | waking | error

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await api.health({ timeout: 5000 });
        if (!cancelled) setStatus('ok');
      } catch (err) {
        if (cancelled) return;
        if (err?.name === 'AbortError') {
          setStatus('waking');
        } else {
          setStatus('error');
        }
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'ok' || status === 'checking') return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        background: status === 'waking' ? '#ff9800' : '#f44336',
        color: '#fff',
        padding: '10px 16px',
        borderRadius: 8,
        zIndex: 9999,
        fontSize: 13,
        maxWidth: 260,
      }}
    >
      {status === 'waking'
        ? 'Сервер просыпается, подождите 30–60 сек...'
        : 'Сервер недоступен. Проверьте Railway/Render.'}
    </div>
  );
}
