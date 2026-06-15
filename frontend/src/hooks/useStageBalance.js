import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

const STAGE_KEY_MAP = {
  Раскрой: 'cutting',
  Пошив: 'sewing',
  ОТК: 'otk',
  Отгрузка: 'shipment',
  Склад: 'stock',
  warehouse: 'warehouse',
  cutting: 'cutting',
  sewing: 'sewing',
  otk: 'otk',
  shipment: 'shipment',
  stock: 'stock',
};

function resolveStageKey(stage) {
  if (stage == null || stage === '') return null;
  return STAGE_KEY_MAP[String(stage)] || STAGE_KEY_MAP[stage] || null;
}

const ERDEN_SIZE_BY_NUM = {
  38: '38/XXS',
  40: '40/XS',
  42: '42/S',
  44: '44/M',
  46: '46/L',
  48: '48/XL',
  50: '50/2XL',
  52: '52/3XL',
  54: '54/4XL',
  56: '56/5XL',
};

function normalizeSizeKey(size) {
  const s = String(size ?? '').trim();
  if (!s) return '';
  if (Object.values(ERDEN_SIZE_BY_NUM).includes(s)) return s;
  const m = s.match(/\b(38|40|42|44|46|48|50|52|54|56)\b/);
  if (m) return ERDEN_SIZE_BY_NUM[parseInt(m[1], 10)] || s;
  return s;
}

function readSizeQty(bucket, size) {
  if (!bucket || typeof bucket !== 'object') return 0;
  const key = normalizeSizeKey(size);
  if (bucket[key] != null) return parseInt(bucket[key], 10) || 0;
  if (bucket[size] != null) return parseInt(bucket[size], 10) || 0;
  return 0;
}

/**
 * Сквозной баланс по размерам: раскрой → пошив → ОТК → отгрузка.
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
    setBalance(null);
    try {
      const params = {};
      if (excludeDocId) params.exclude_id = excludeDocId;
      const oid = parseInt(String(orderId).trim(), 10);
      if (!Number.isFinite(oid) || oid <= 0) {
        setBalance(null);
        return;
      }
      const res = await api.movements.stageBalance(oid, params);
      setBalance(res?.balance ?? null);
    } catch (err) {
      console.error('[useStageBalance]', err?.message || err);
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, excludeDocId, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  const getAvailable = useCallback(
    (stage, size) => {
      const key = resolveStageKey(stage);
      if (!key || !balance) return 0;
      return readSizeQty(balance[key], size);
    },
    [balance]
  );

  const getTotalAvailable = useCallback(
    (stage) => {
      const key = resolveStageKey(stage);
      if (!key || !balance || !balance[key]) return 0;
      return Object.values(balance[key]).reduce(
        (s, v) => s + (parseInt(v, 10) || 0),
        0
      );
    },
    [balance]
  );

  return {
    balance,
    loading,
    reload,
    getAvailable,
    getTotalAvailable,
  };
}
