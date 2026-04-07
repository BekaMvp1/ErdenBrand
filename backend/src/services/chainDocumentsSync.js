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
    try {
      const p = ch.purchase_week_start;
      const c = ch.cutting_week_start;
      try {
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
      } catch (purchaseErr) {
        console.error('[chainDocumentsSync] purchase_documents chain_id=', ch.id, purchaseErr.message);
      }
      try {
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
      } catch (cuttingErr) {
        console.error('[chainDocumentsSync] cutting_documents chain_id=', ch.id, cuttingErr.message);
      }
    } catch (chErr) {
      console.error('[chainDocumentsSync] chain id=', ch.id, chErr.message);
    }
  }
}

module.exports = { syncDocumentsForChainIds };
