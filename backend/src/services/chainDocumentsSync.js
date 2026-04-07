/**
 * Создание/обновление purchase_documents и cutting_documents по id строк planning_chains.
 * Вызывается после POST /api/planning/chain (PlanningDraft не трогаем).
 */

const db = require('../models');

async function syncDocumentsForChainIds(chainIds) {
  const ids = [...new Set(chainIds.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return;
  const chains = await db.PlanningChain.findAll({ where: { id: ids } });
  for (const ch of chains) {
    const p = ch.purchase_week_start;
    const c = ch.cutting_week_start;
    const [pd, pCreated] = await db.PurchaseDocument.findOrCreate({
      where: { chain_id: ch.id },
      defaults: {
        chain_id: ch.id,
        order_id: ch.order_id,
        section_id: ch.section_id,
        week_start: p,
        original_week_start: p,
        actual_week_start: p,
        status: 'pending',
      },
    });
    if (!pCreated) {
      await pd.update({
        order_id: ch.order_id,
      });
    }
    const [cd, cCreated] = await db.CuttingDocument.findOrCreate({
      where: { chain_id: ch.id },
      defaults: {
        chain_id: ch.id,
        order_id: ch.order_id,
        section_id: ch.section_id,
        week_start: c,
        original_week_start: c,
        actual_week_start: c,
        status: 'pending',
      },
    });
    if (!cCreated) {
      await cd.update({
        order_id: ch.order_id,
      });
    }
  }
}

module.exports = { syncDocumentsForChainIds };
