/**
 * Финансовая сводка по заказу: материалы и операции (раскрой / пошив / ОТК).
 */

import { useMemo } from 'react';

const FLABEL = {
  padding: '6px 8px',
  color: '#cbd5e1',
  fontSize: 13,
  width: '45%',
};

const FVAL = {
  padding: '6px 8px',
  color: '#e2e8f0',
  fontWeight: 600,
  fontSize: 13,
  textAlign: 'right',
  width: '30%',
};

const FDETAIL = {
  padding: '6px 8px',
  color: '#64748b',
  fontSize: 11,
  textAlign: 'right',
  width: '25%',
};

function parseNum(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function fmt(n) {
  return `${Math.round(n).toLocaleString('ru-RU')} сом`;
}

function flattenOpsJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((r) => r && typeof r === 'object');
  if (typeof raw === 'object' && Array.isArray(raw.groups)) {
    const out = [];
    for (const g of raw.groups) {
      for (const r of g.rows || []) {
        if (r && typeof r === 'object') out.push(r);
      }
    }
    return out;
  }
  return [];
}

function opPrice(r) {
  return parseNum(r?.price ?? r?.cost ?? r?.rateSom ?? r?.operation_cost);
}

function opName(r) {
  return String(r?.name || r?.operation_name || r?.operation || '').trim();
}

function opsForStage(order, stage) {
  const key =
    stage === 'cutting' ? 'cutting_ops' : stage === 'sewing' ? 'sewing_ops' : 'otk_ops';
  const direct = flattenOpsJson(order?.[key]);
  if (direct.length > 0) {
    return direct
      .map((r) => ({ name: opName(r), price: opPrice(r) }))
      .filter((r) => r.name);
  }

  const ops = Array.isArray(order?.OrderOperations) ? order.OrderOperations : [];
  const filtered = ops.filter((op) => {
    const cat = String(op.Operation?.category || '').toUpperCase();
    const n = String(op.Operation?.name || op.name || '').toLowerCase();
    const sk = String(op.stage_key || '').toLowerCase();
    if (stage === 'cutting') {
      return cat === 'CUTTING' || /раскрой|cut/.test(n) || sk.includes('cut');
    }
    if (stage === 'sewing') {
      return cat === 'SEWING' || /пошив|sew/.test(n) || sk.includes('sew');
    }
    if (stage === 'otk') {
      return cat === 'FINISH' || /отк|qc|контрол/.test(n) || sk.includes('otk');
    }
    return false;
  });

  return filtered.map((op) => ({
    name: String(op.Operation?.name || op.name || '').trim(),
    price: parseNum(op.price ?? op.cost ?? op.operation_cost),
  }));
}

function calcOpsTotal(ops, qty) {
  return ops.reduce((sum, op) => sum + op.price * qty, 0);
}

function materialLineSum(row, qty) {
  const perUnit = parseNum(row.qty_per_unit);
  const qtyTotalRaw = parseNum(row.qty_total);
  const totalQty = qtyTotalRaw > 0 ? qtyTotalRaw : perUnit * qty;
  const rate = parseNum(row.price_per_unit);
  return totalQty * rate;
}

function OpsDetailRows({ ops, qty, keyPrefix }) {
  return ops
    .filter((op) => op.price > 0)
    .map((op, i) => (
      <tr key={`${keyPrefix}${i}`} style={{ opacity: 0.75 }}>
        <td
          style={{
            ...FLABEL,
            paddingLeft: 28,
            color: '#64748b',
            fontSize: 11,
          }}
        >
          — {op.name || '—'}
        </td>
        <td style={{ ...FVAL, color: '#94a3b8', fontSize: 11 }}>{fmt(op.price * qty)}</td>
        <td style={{ ...FDETAIL, fontSize: 11, color: '#64748b' }}>{op.price} сом/шт</td>
      </tr>
    ));
}

function StageRow({ icon, label, total, opsCount, ops, qty, keyPrefix }) {
  if (total <= 0) return null;
  return (
    <>
      <tr>
        <td style={FLABEL}>
          {icon} {label}
        </td>
        <td style={FVAL}>{fmt(total)}</td>
        <td style={FDETAIL}>{opsCount} операций</td>
      </tr>
      <OpsDetailRows ops={ops} qty={qty} keyPrefix={keyPrefix} />
    </>
  );
}

export default function OrderFinanceBlock({ order, fabricRows = [], accessoriesRows = [] }) {
  const summary = useMemo(() => {
    const qty = parseNum(order?.total_quantity ?? order?.quantity);
    const materialsCount = fabricRows.length + accessoriesRows.length;
    const materialsTotal =
      fabricRows.reduce((s, r) => s + materialLineSum(r, qty), 0) +
      accessoriesRows.reduce((s, r) => s + materialLineSum(r, qty), 0);

    const cuttingOps = opsForStage(order, 'cutting');
    const sewingOps = opsForStage(order, 'sewing');
    const otkOps = opsForStage(order, 'otk');

    let cuttingTotal = calcOpsTotal(cuttingOps, qty);
    let sewingTotal = calcOpsTotal(sewingOps, qty);
    let otkTotal = calcOpsTotal(otkOps, qty);

    if (cuttingTotal <= 0 && order?.total_cutting_cost != null) {
      cuttingTotal = parseNum(order.total_cutting_cost);
    }
    if (sewingTotal <= 0 && order?.total_sewing_cost != null) {
      sewingTotal = parseNum(order.total_sewing_cost);
    }
    if (otkTotal <= 0 && order?.total_otk_cost != null) {
      otkTotal = parseNum(order.total_otk_cost);
    }

    const opsTotal = cuttingTotal + sewingTotal + otkTotal;
    const grandTotal = materialsTotal + opsTotal;

    return {
      qty,
      materialsCount,
      materialsTotal,
      cuttingOps,
      sewingOps,
      otkOps,
      cuttingTotal,
      sewingTotal,
      otkTotal,
      opsTotal,
      grandTotal,
    };
  }, [order, fabricRows, accessoriesRows]);

  if (!order) return null;

  const showBlock =
    summary.materialsTotal > 0 ||
    summary.opsTotal > 0 ||
    summary.materialsCount > 0 ||
    summary.cuttingOps.length > 0 ||
    summary.sewingOps.length > 0 ||
    summary.otkOps.length > 0;

  if (!showBlock) return null;

  return (
    <div
      className="card-neon rounded-card overflow-hidden mt-4 sm:mt-6 transition-block"
      style={{
        background: '#0a1628',
        border: '1px solid #1e3a5f',
      }}
    >
      <div style={{ padding: '20px 24px' }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#a3e635',
            marginBottom: 16,
          }}
        >
          💰 Финансы по заказу
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            <tr>
              <td style={FLABEL}>📦 Материалы</td>
              <td style={FVAL}>{fmt(summary.materialsTotal)}</td>
              <td style={FDETAIL}>{summary.materialsCount} позиций</td>
            </tr>

            <StageRow
              icon="✂️"
              label="Раскрой"
              total={summary.cuttingTotal}
              opsCount={summary.cuttingOps.length}
              ops={summary.cuttingOps}
              qty={summary.qty}
              keyPrefix="c"
            />

            <StageRow
              icon="🧵"
              label="Пошив"
              total={summary.sewingTotal}
              opsCount={summary.sewingOps.length}
              ops={summary.sewingOps}
              qty={summary.qty}
              keyPrefix="s"
            />

            <StageRow
              icon="✅"
              label="ОТК"
              total={summary.otkTotal}
              opsCount={summary.otkOps.length}
              ops={summary.otkOps}
              qty={summary.qty}
              keyPrefix="o"
            />

            <tr>
              <td
                colSpan={3}
                style={{
                  borderTop: '1px solid #1e3a5f',
                  paddingTop: 8,
                  paddingBottom: 4,
                }}
              />
            </tr>

            <tr>
              <td style={{ ...FLABEL, color: '#fbbf24', fontWeight: 600 }}>⚙️ Итого операции</td>
              <td style={{ ...FVAL, color: '#fbbf24', fontWeight: 700 }}>{fmt(summary.opsTotal)}</td>
              <td style={FDETAIL} />
            </tr>

            <tr style={{ background: '#0f2040' }}>
              <td
                style={{
                  ...FLABEL,
                  color: '#a3e635',
                  fontWeight: 700,
                  fontSize: 14,
                  paddingTop: 10,
                }}
              >
                💎 ИТОГО по заказу
              </td>
              <td
                style={{
                  ...FVAL,
                  color: '#a3e635',
                  fontWeight: 700,
                  fontSize: 15,
                  paddingTop: 10,
                }}
              >
                {fmt(summary.grandTotal)}
              </td>
              <td style={{ ...FDETAIL, color: '#64748b', paddingTop: 10 }}>
                на {summary.qty} шт
              </td>
            </tr>

            {summary.qty > 0 ? (
              <tr>
                <td style={{ ...FLABEL, color: '#94a3b8', fontSize: 11 }}>Себестоимость / шт</td>
                <td style={{ ...FVAL, color: '#94a3b8', fontSize: 11 }}>
                  {fmt(summary.grandTotal / summary.qty)}
                </td>
                <td style={FDETAIL} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
