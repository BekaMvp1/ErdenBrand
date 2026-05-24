import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';

const CARD = {
  background: '#0f1a2e',
  border: '1px solid #1e3a5f',
  borderRadius: 10,
  padding: '16px 20px',
  marginBottom: 16,
};
const LABEL = {
  fontSize: 11,
  color: '#64748b',
  display: 'block',
  marginBottom: 3,
};
const INPUT = {
  background: '#1a1a2e',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 13,
  width: '100%',
};

const v = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

function parseMovementDocItemProduct(item) {
  const raw = String(item.item_name || '').trim();
  let qty = Number(item.qty || 0);
  let operationCost = Number(item.price || 0);
  if (raw.startsWith('SEW_OTK_JSON:')) {
    try {
      const json = JSON.parse(raw.replace(/^SEW_OTK_JSON:/, ''));
      const sizes = json.sizes && typeof json.sizes === 'object' ? json.sizes : {};
      const fromSizes = Object.values(sizes).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
      if (fromSizes > 0) qty = fromSizes;
      else if (json.total_qty != null) qty = Number(json.total_qty) || qty;
      if (json.operation_cost != null) operationCost = Number(json.operation_cost) || operationCost;
    } catch {
      /* ignore */
    }
  }
  return {
    qty: Number.isFinite(qty) ? qty : 0,
    operationCost: Number.isFinite(operationCost) ? operationCost : 0,
  };
}

function isFabricLikeItem(item) {
  const u = String(item.unit || '').toLowerCase();
  const n = String(item.item_name || '').toLowerCase();
  if (u.includes('м') && !u.includes('шт')) return true;
  if (u === 'м' || u === 'm') return true;
  if (n.includes('ткан') || n.includes('fabric') || n.includes('рулон')) return true;
  return false;
}

export default function CostCalculation() {
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState(searchParams.get('order_id') || '');
  const [, setCalc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [cutting, setCutting] = useState({
    fabric_qty: '',
    fabric_price: '',
    accessories_qty: '',
    accessories_price: '',
    output_qty: '',
    op_cost_per_unit: '',
    items: [],
  });

  const [sewing, setSewing] = useState({
    accessories_qty: '',
    accessories_price: '',
    output_qty: '',
    op_cost_per_unit: '',
    items: [],
  });

  const [otk, setOtk] = useState({
    accessories_qty: '',
    accessories_price: '',
    output_qty: '',
    op_cost_per_unit: '',
    items: [],
  });

  const [fromMovements, setFromMovements] = useState({
    cutting: false,
    sewing: false,
    otk: false,
  });

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadFromMovements = useCallback(
    async (oid) => {
      if (!oid) return;
      try {
        const movements = await api.movements.list({
          order_id: String(oid),
          status: 'posted',
        });
        const list = Array.isArray(movements) ? movements : [];

        const warehouseToCutting = list.filter(
          (m) => m.stage_meta?.from_stage === 'warehouse' && m.stage_meta?.to_stage === 'cutting'
        );
        const cuttingToSewing = list.filter(
          (m) => m.stage_meta?.from_stage === 'cutting' && m.stage_meta?.to_stage === 'sewing'
        );
        const sewingToOtk = list.filter(
          (m) => m.stage_meta?.from_stage === 'sewing' && m.stage_meta?.to_stage === 'otk'
        );

        let fabricQty = 0;
        let fabricSum = 0;
        let accQty = 0;
        let accSum = 0;
        let cutOutputQty = 0;
        let cutOpCost = 0;
        let sewAccQty = 0;
        let sewAccSum = 0;

        for (const mov of warehouseToCutting) {
          const items = mov.Items || mov.items || [];
          for (const item of items) {
            const qty = Number(item.qty || 0);
            const price = Number(item.price || 0);
            const type = item.material_type || item.type || '';
            const isFab =
              type === 'fabric' ||
              type === 'Ткань' ||
              String(type).toLowerCase() === 'fabric' ||
              isFabricLikeItem(item);
            if (isFab) {
              fabricQty += qty;
              fabricSum += qty * price;
            } else {
              accQty += qty;
              accSum += qty * price;
            }
          }
        }

        for (const mov of cuttingToSewing) {
          const items = mov.Items || mov.items || [];
          for (const item of items) {
            const raw = String(item.item_name || '');
            const { qty, operationCost } = parseMovementDocItemProduct(item);
            cutOutputQty += qty;
            if (operationCost > 0) cutOpCost = operationCost;
            if (!raw.startsWith('SEW_OTK_JSON:')) {
              const q = Number(item.qty || 0);
              const p = Number(item.price || 0);
              sewAccQty += q;
              sewAccSum += q * p;
            }
          }
        }

        let sewOut = cutOutputQty;
        let sewOp = cutOpCost;

        let otkOut = 0;
        let otkOp = 0;
        let otkAccQty = 0;
        let otkAccSum = 0;
        for (const mov of sewingToOtk) {
          const items = mov.Items || mov.items || [];
          for (const item of items) {
            const raw = String(item.item_name || '');
            const { qty, operationCost } = parseMovementDocItemProduct(item);
            otkOut += qty;
            if (operationCost > 0) otkOp = operationCost;
            if (!raw.startsWith('SEW_OTK_JSON:')) {
              const q = Number(item.qty || 0);
              const p = Number(item.price || 0);
              otkAccQty += q;
              otkAccSum += q * p;
            }
          }
        }

        const filledCutting =
          (warehouseToCutting.length > 0 && (fabricQty > 0 || accQty > 0)) ||
          (cuttingToSewing.length > 0 && (cutOutputQty > 0 || cutOpCost > 0));
        const filledSewing =
          cuttingToSewing.length > 0 && (sewOut > 0 || sewOp > 0 || sewAccQty > 0);
        const filledOtk = sewingToOtk.length > 0 && (otkOut > 0 || otkOp > 0 || otkAccQty > 0);

        setCutting((prev) => ({
          ...prev,
          fabric_qty: fabricQty > 0 ? fabricQty.toFixed(2) : prev.fabric_qty,
          fabric_price: fabricQty > 0 ? (fabricSum / fabricQty).toFixed(2) : prev.fabric_price,
          accessories_qty: accQty > 0 ? String(Math.round(accQty)) : prev.accessories_qty,
          accessories_price: accQty > 0 ? (accSum / accQty).toFixed(2) : prev.accessories_price,
          output_qty: cutOutputQty > 0 ? String(Math.round(cutOutputQty)) : prev.output_qty,
          op_cost_per_unit: cutOpCost > 0 ? String(cutOpCost) : prev.op_cost_per_unit,
        }));

        setSewing((prev) => ({
          ...prev,
          output_qty: sewOut > 0 ? String(Math.round(sewOut)) : prev.output_qty,
          op_cost_per_unit: sewOp > 0 ? String(sewOp) : prev.op_cost_per_unit,
          accessories_qty: sewAccQty > 0 ? String(Math.round(sewAccQty)) : prev.accessories_qty,
          accessories_price: sewAccQty > 0 ? (sewAccSum / sewAccQty).toFixed(2) : prev.accessories_price,
        }));

        setOtk((prev) => ({
          ...prev,
          output_qty: otkOut > 0 ? String(Math.round(otkOut)) : prev.output_qty,
          op_cost_per_unit: otkOp > 0 ? String(otkOp) : prev.op_cost_per_unit,
          accessories_qty: otkAccQty > 0 ? String(Math.round(otkAccQty)) : prev.accessories_qty,
          accessories_price: otkAccQty > 0 ? (otkAccSum / otkAccQty).toFixed(2) : prev.accessories_price,
        }));

        setFromMovements({
          cutting: filledCutting,
          sewing: filledSewing,
          otk: filledOtk,
        });

        if (list.length > 0) {
          showToast(`Загружено ${list.length} перемещений`, 'info');
        }
      } catch (e) {
        console.error('[loadFromMovements]:', e?.message || e);
      }
    },
    [showToast]
  );

  const applyServerCalc = useCallback((d) => {
    if (!d) return;
    setCalc(d);
    setCutting({
      fabric_qty: d.cutting_fabric_qty ?? '',
      fabric_price:
        Number(d.cutting_fabric_qty) > 0
          ? (Number(d.cutting_fabric_sum) / Number(d.cutting_fabric_qty)).toFixed(2)
          : '',
      accessories_qty: d.cutting_accessories_qty ?? '',
      accessories_price:
        Number(d.cutting_accessories_qty) > 0
          ? (Number(d.cutting_accessories_sum) / Number(d.cutting_accessories_qty)).toFixed(2)
          : '',
      output_qty: d.cutting_output_qty ?? '',
      op_cost_per_unit: d.cutting_op_cost_per_unit ?? '',
      items: (d.Items || []).filter((i) => i.stage === 'cutting'),
    });
    setSewing({
      accessories_qty: d.sewing_accessories_qty ?? '',
      accessories_price:
        Number(d.sewing_accessories_qty) > 0
          ? (Number(d.sewing_accessories_sum) / Number(d.sewing_accessories_qty)).toFixed(2)
          : '',
      output_qty: d.sewing_output_qty ?? '',
      op_cost_per_unit: d.sewing_op_cost_per_unit ?? '',
      items: (d.Items || []).filter((i) => i.stage === 'sewing'),
    });
    setOtk({
      accessories_qty: d.otk_accessories_qty ?? '',
      accessories_price:
        Number(d.otk_accessories_qty) > 0
          ? (Number(d.otk_accessories_sum) / Number(d.otk_accessories_qty)).toFixed(2)
          : '',
      output_qty: d.otk_output_qty ?? '',
      op_cost_per_unit: d.otk_op_cost_per_unit ?? '',
      items: (d.Items || []).filter((i) => i.stage === 'otk'),
    });
  }, []);

  useEffect(() => {
    api.orders
      .list({ limit: 50 })
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    if (!orderId) {
      setFromMovements({ cutting: false, sewing: false, otk: false });
      return;
    }
    setFromMovements({ cutting: false, sewing: false, otk: false });
    let cancelled = false;
    (async () => {
      try {
        const d = await api.get(`/api/cost-calculations/order/${orderId}`);
        if (!cancelled) applyServerCalc(d);
      } catch {
        /* нет сохранённой калькуляции */
      }
      if (!cancelled) await loadFromMovements(String(orderId));
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const cuttingFabricSum = v(cutting.fabric_qty) * v(cutting.fabric_price);
  const cuttingAccSum = v(cutting.accessories_qty) * v(cutting.accessories_price);
  const cuttingOpTotal = v(cutting.output_qty) * v(cutting.op_cost_per_unit);
  const cuttingTotal = cuttingFabricSum + cuttingAccSum + cuttingOpTotal;

  const sewingAccSum = v(sewing.accessories_qty) * v(sewing.accessories_price);
  const sewingOpTotal = v(sewing.output_qty) * v(sewing.op_cost_per_unit);
  const sewingTotal = cuttingTotal + sewingAccSum + sewingOpTotal;

  const otkAccSum = v(otk.accessories_qty) * v(otk.accessories_price);
  const otkOpTotal = v(otk.output_qty) * v(otk.op_cost_per_unit);
  const otkTotal = sewingTotal + otkAccSum + otkOpTotal;

  const finalQty = v(otk.output_qty) || v(sewing.output_qty) || v(cutting.output_qty);
  const costPerUnit = finalQty > 0 ? otkTotal / finalQty : 0;

  const money = (n) => `${Math.round(n).toLocaleString('ru-RU')} сом`;

  const handleSave = async () => {
    if (!orderId) {
      showToast('Выберите заказ', 'error');
      return;
    }
    setSaving(true);
    try {
      const items = [
        {
          stage: 'cutting',
          material_type: 'fabric',
          material_name: 'Ткань',
          qty: v(cutting.fabric_qty),
          unit: 'м',
          price: v(cutting.fabric_price),
        },
        {
          stage: 'cutting',
          material_type: 'accessories',
          material_name: 'Фурнитура (раскрой)',
          qty: v(cutting.accessories_qty),
          unit: 'шт',
          price: v(cutting.accessories_price),
        },
        {
          stage: 'cutting',
          material_type: 'operation',
          material_name: 'Операция раскроя',
          qty: v(cutting.output_qty),
          unit: 'шт',
          price: v(cutting.op_cost_per_unit),
        },
        {
          stage: 'sewing',
          material_type: 'accessories',
          material_name: 'Фурнитура (пошив)',
          qty: v(sewing.accessories_qty),
          unit: 'шт',
          price: v(sewing.accessories_price),
        },
        {
          stage: 'sewing',
          material_type: 'operation',
          material_name: 'Операция пошива',
          qty: v(sewing.output_qty),
          unit: 'шт',
          price: v(sewing.op_cost_per_unit),
        },
        {
          stage: 'otk',
          material_type: 'accessories',
          material_name: 'Фурнитура (ОТК)',
          qty: v(otk.accessories_qty),
          unit: 'шт',
          price: v(otk.accessories_price),
        },
        {
          stage: 'otk',
          material_type: 'operation',
          material_name: 'Операция ОТК',
          qty: v(otk.output_qty),
          unit: 'шт',
          price: v(otk.op_cost_per_unit),
        },
        ...cutting.items.filter((i) => i.custom),
        ...sewing.items.filter((i) => i.custom),
        ...otk.items.filter((i) => i.custom),
      ].filter((i) => i.qty > 0 || i.price > 0);

      const saved = await api.post(`/api/cost-calculations/order/${orderId}`, {
        cutting_fabric_qty: v(cutting.fabric_qty),
        cutting_fabric_sum: cuttingFabricSum,
        cutting_accessories_qty: v(cutting.accessories_qty),
        cutting_accessories_sum: cuttingAccSum,
        cutting_output_qty: v(cutting.output_qty),
        cutting_op_cost_per_unit: v(cutting.op_cost_per_unit),
        sewing_accessories_qty: v(sewing.accessories_qty),
        sewing_accessories_sum: sewingAccSum,
        sewing_output_qty: v(sewing.output_qty),
        sewing_op_cost_per_unit: v(sewing.op_cost_per_unit),
        otk_accessories_qty: v(otk.accessories_qty),
        otk_accessories_sum: otkAccSum,
        otk_output_qty: v(otk.output_qty),
        otk_op_cost_per_unit: v(otk.op_cost_per_unit),
        items,
      });
      applyServerCalc(saved);
      showToast('Себестоимость сохранена!');
    } catch (e) {
      showToast(e?.message || 'Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        padding: '20px',
        maxWidth: 1000,
        margin: '0 auto',
        color: '#e2e8f0',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h2 style={{ color: '#a3e635', margin: 0, fontSize: 22 }}>🏭 Производство — Себестоимость</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => orderId && loadFromMovements(orderId)}
            style={{
              background: '#1e3a5f',
              color: '#93c5fd',
              border: '1px solid #374151',
              borderRadius: 8,
              padding: '10px 16px',
              cursor: orderId ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontWeight: 600,
              opacity: orderId ? 1 : 0.5,
            }}
            disabled={!orderId}
          >
            🔄 Из перемещений
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              background: saving ? '#374151' : '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {saving ? '⏳ Сохранение...' : '💾 Сохранить'}
          </button>
        </div>
      </div>

      <div style={{ ...CARD, marginBottom: 20 }}>
        <label style={LABEL}>Заказ</label>
        <select
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          style={{ ...INPUT, maxWidth: 400 }}
        >
          <option value="">— Выберите заказ —</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.tz_code || o.title || o.id} · {o.model_name || o.title || ''}
            </option>
          ))}
        </select>
      </div>

      <div style={CARD}>
        <h3 style={{ color: '#a3e635', marginTop: 0, marginBottom: 12 }}>✂️ Раскрой</h3>
        {fromMovements.cutting &&
        (v(cutting.output_qty) > 0 ||
          v(cutting.fabric_qty) > 0 ||
          v(cutting.accessories_qty) > 0) ? (
          <div
            style={{
              fontSize: 11,
              color: '#4ade80',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ✅ Данные загружены из перемещений
          </div>
        ) : null}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <label style={LABEL}>Ткань (кол-во, м)</label>
            <input
              type="number"
              style={INPUT}
              value={cutting.fabric_qty}
              placeholder="0"
              onChange={(e) => setCutting((p) => ({ ...p, fabric_qty: e.target.value }))}
            />
          </div>
          <div>
            <label style={LABEL}>Цена за м (сом)</label>
            <input
              type="number"
              style={INPUT}
              value={cutting.fabric_price}
              placeholder="0"
              onChange={(e) => setCutting((p) => ({ ...p, fabric_price: e.target.value }))}
            />
          </div>
          <div>
            <label style={LABEL}>Фурнитура (кол-во)</label>
            <input
              type="number"
              style={INPUT}
              value={cutting.accessories_qty}
              placeholder="0"
              onChange={(e) => setCutting((p) => ({ ...p, accessories_qty: e.target.value }))}
            />
          </div>
          <div>
            <label style={LABEL}>Цена за ед (сом)</label>
            <input
              type="number"
              style={INPUT}
              value={cutting.accessories_price}
              placeholder="0"
              onChange={(e) => setCutting((p) => ({ ...p, accessories_price: e.target.value }))}
            />
          </div>
          <div>
            <label style={LABEL}>Вышло изделий (шт)</label>
            <input
              type="number"
              style={INPUT}
              value={cutting.output_qty}
              placeholder="0"
              onChange={(e) => setCutting((p) => ({ ...p, output_qty: e.target.value }))}
            />
          </div>
          <div>
            <label style={LABEL}>Стоимость оп. за ед (сом)</label>
            <input
              type="number"
              style={INPUT}
              value={cutting.op_cost_per_unit}
              placeholder="0"
              onChange={(e) => setCutting((p) => ({ ...p, op_cost_per_unit: e.target.value }))}
            />
          </div>
        </div>

        <div
          style={{
            background: '#1e3a5f',
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 11 }}>Ткань</div>
              <div style={{ fontWeight: 600 }}>
                {v(cutting.fabric_qty)} м × {v(cutting.fabric_price)} =
                <span style={{ color: '#fbbf24' }}> {money(cuttingFabricSum)}</span>
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11 }}>Фурнитура</div>
              <div style={{ fontWeight: 600 }}>
                {v(cutting.accessories_qty)} шт × {v(cutting.accessories_price)} =
                <span style={{ color: '#fbbf24' }}> {money(cuttingAccSum)}</span>
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11 }}>ЗП раскроя</div>
              <div style={{ fontWeight: 600 }}>
                {v(cutting.output_qty)} × {v(cutting.op_cost_per_unit)} =
                <span style={{ color: '#fbbf24' }}> {money(cuttingOpTotal)}</span>
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11 }}>Итого себест. после раскроя</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#a3e635' }}>{money(cuttingTotal)}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={CARD}>
        <h3 style={{ color: '#a3e635', marginTop: 0, marginBottom: 12 }}>🧵 Пошив</h3>
        {fromMovements.sewing &&
        (v(sewing.output_qty) > 0 || v(sewing.accessories_qty) > 0 || v(sewing.op_cost_per_unit) > 0) ? (
          <div
            style={{
              fontSize: 11,
              color: '#4ade80',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ✅ Данные загружены из перемещений
          </div>
        ) : null}
        <div
          style={{
            background: '#0a1628',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 12,
            color: '#64748b',
          }}
        >
          Себестоимость после раскроя:
          <span style={{ color: '#fbbf24', fontWeight: 600, marginLeft: 8 }}>{money(cuttingTotal)}</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <label style={LABEL}>Фурнитура (кол-во)</label>
            <input
              type="number"
              style={INPUT}
              value={sewing.accessories_qty}
              placeholder="0"
              onChange={(e) => setSewing((p) => ({ ...p, accessories_qty: e.target.value }))}
            />
          </div>
          <div>
            <label style={LABEL}>Цена за ед (сом)</label>
            <input
              type="number"
              style={INPUT}
              value={sewing.accessories_price}
              placeholder="0"
              onChange={(e) => setSewing((p) => ({ ...p, accessories_price: e.target.value }))}
            />
          </div>
          <div>
            <label style={LABEL}>Вышло изделий (шт)</label>
            <input
              type="number"
              style={INPUT}
              value={sewing.output_qty}
              placeholder="0"
              onChange={(e) => setSewing((p) => ({ ...p, output_qty: e.target.value }))}
            />
          </div>
          <div>
            <label style={LABEL}>Стоимость оп. за ед (сом)</label>
            <input
              type="number"
              style={INPUT}
              value={sewing.op_cost_per_unit}
              placeholder="0"
              onChange={(e) => setSewing((p) => ({ ...p, op_cost_per_unit: e.target.value }))}
            />
          </div>
        </div>
        <div
          style={{
            background: '#1e3a5f',
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 11 }}>Фурнитура</div>
              <div style={{ fontWeight: 600 }}>
                {v(sewing.accessories_qty)} × {v(sewing.accessories_price)} =
                <span style={{ color: '#fbbf24' }}> {money(sewingAccSum)}</span>
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11 }}>ЗП пошива</div>
              <div style={{ fontWeight: 600 }}>
                {v(sewing.output_qty)} × {v(sewing.op_cost_per_unit)} =
                <span style={{ color: '#fbbf24' }}> {money(sewingOpTotal)}</span>
              </div>
            </div>
            <div />
            <div>
              <div style={{ color: '#64748b', fontSize: 11 }}>Итого себест. после пошива</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#a3e635' }}>{money(sewingTotal)}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={CARD}>
        <h3 style={{ color: '#a3e635', marginTop: 0, marginBottom: 12 }}>🔍 ОТК</h3>
        {fromMovements.otk &&
        (v(otk.output_qty) > 0 || v(otk.accessories_qty) > 0 || v(otk.op_cost_per_unit) > 0) ? (
          <div
            style={{
              fontSize: 11,
              color: '#4ade80',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ✅ Данные загружены из перемещений
          </div>
        ) : null}
        <div
          style={{
            background: '#0a1628',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 12,
            color: '#64748b',
          }}
        >
          Себестоимость после пошива:
          <span style={{ color: '#fbbf24', fontWeight: 600, marginLeft: 8 }}>{money(sewingTotal)}</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <label style={LABEL}>Фурнитура (кол-во)</label>
            <input
              type="number"
              style={INPUT}
              value={otk.accessories_qty}
              placeholder="0"
              onChange={(e) => setOtk((p) => ({ ...p, accessories_qty: e.target.value }))}
            />
          </div>
          <div>
            <label style={LABEL}>Цена за ед (сом)</label>
            <input
              type="number"
              style={INPUT}
              value={otk.accessories_price}
              placeholder="0"
              onChange={(e) => setOtk((p) => ({ ...p, accessories_price: e.target.value }))}
            />
          </div>
          <div>
            <label style={LABEL}>Вышло изделий (шт)</label>
            <input
              type="number"
              style={INPUT}
              value={otk.output_qty}
              placeholder="0"
              onChange={(e) => setOtk((p) => ({ ...p, output_qty: e.target.value }))}
            />
          </div>
          <div>
            <label style={LABEL}>Стоимость оп. за ед (сом)</label>
            <input
              type="number"
              style={INPUT}
              value={otk.op_cost_per_unit}
              placeholder="0"
              onChange={(e) => setOtk((p) => ({ ...p, op_cost_per_unit: e.target.value }))}
            />
          </div>
        </div>
        <div
          style={{
            background: '#1e3a5f',
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 11 }}>Фурнитура</div>
              <div style={{ fontWeight: 600 }}>
                {v(otk.accessories_qty)} × {v(otk.accessories_price)} =
                <span style={{ color: '#fbbf24' }}> {money(otkAccSum)}</span>
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11 }}>ЗП ОТК</div>
              <div style={{ fontWeight: 600 }}>
                {v(otk.output_qty)} × {v(otk.op_cost_per_unit)} =
                <span style={{ color: '#fbbf24' }}> {money(otkOpTotal)}</span>
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11 }}>Итого себест. после ОТК</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#a3e635' }}>{money(otkTotal)}</div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          background: '#0a2a1a',
          border: '2px solid #16a34a',
          borderRadius: 12,
          padding: '20px 24px',
        }}
      >
        <h3 style={{ margin: '0 0 16px', color: '#a3e635', fontSize: 18 }}>📊 Итоговая себестоимость</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>После раскроя</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#fbbf24' }}>{money(cuttingTotal)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>После пошива</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#fbbf24' }}>{money(sewingTotal)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>После ОТК</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#fbbf24' }}>{money(otkTotal)}</div>
          </div>
          <div
            style={{
              textAlign: 'center',
              background: '#16a34a22',
              borderRadius: 8,
              padding: '8px',
            }}
          >
            <div style={{ color: '#86efac', fontSize: 11, marginBottom: 4 }}>Себестоимость 1 ед</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: '#4ade80' }}>
              {Math.round(costPerUnit).toLocaleString('ru-RU')} сом
            </div>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
              Итого {finalQty} шт = {money(otkTotal)}
            </div>
          </div>
        </div>
      </div>

      {toast ? (
        <div
          style={{
            position: 'fixed',
            bottom: 32,
            right: 32,
            zIndex: 9999,
            padding: '12px 24px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
            background:
              toast.type === 'success'
                ? '#16a34a'
                : toast.type === 'error'
                  ? '#dc2626'
                  : '#2563eb',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            minWidth: 260,
          }}
        >
          {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'} {toast.msg}
        </div>
      ) : null}
    </div>
  );
}
