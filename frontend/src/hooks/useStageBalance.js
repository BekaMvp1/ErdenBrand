import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

/**
 * Сквозной баланс по размерам на этапах (раскрой → пошив → ОТК → отгрузка) для заказа.
 */
export default function useStageBalance(orderId, options = {}) {
  const { excludeDocId, enabled = true } = options;
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !orderId) {
      setBalance(null);
      return;
    }
    setLoading(true);
    try {
      const params = {};
      if (excludeDocId) params.exclude_id = excludeDocId;
      const res = await api.movements.stageBalance(orderId, params);
      setBalance(res?.balance ?? null);
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, excludeDocId, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { balance, loading, reload };
}
