/**
 * Заполнить otk_week_start и shipping_week_start у planning_chains
 * по настройкам цикла (ОТК после пошива, отгрузка после ОТК).
 *
 * Запуск: cd backend && node scripts/fix-planning-chain-otk-shipping-weeks.js
 */

require('dotenv').config();
const { Op } = require('sequelize');
const db = require('../src/models');
const { getWeekStart } = require('../src/utils/planningUtils');

function addWeeksToMondayIso(mondayIso, weeks) {
  if (!mondayIso || !Number.isFinite(weeks) || weeks <= 0) return mondayIso;
  const d = new Date(`${mondayIso}T12:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return getWeekStart(d.toISOString().slice(0, 10));
}

async function main() {
  await db.sequelize.authenticate();
  const settings = await db.ProductionCycleSettings.findOne({ order: [['id', 'ASC']] });
  const otkN = Math.min(4, Math.max(0, Number.isFinite(Number(settings?.otk_lead_weeks)) ? settings.otk_lead_weeks : 1));
  const shipN = Math.min(4, Math.max(0, Number.isFinite(Number(settings?.shipping_lead_weeks)) ? settings.shipping_lead_weeks : 0));

  const chains = await db.PlanningChain.findAll({
    where: {
      sewing_week_start: { [Op.ne]: null },
      [Op.or]: [{ otk_week_start: null }, { shipping_week_start: null }],
    },
  });

  console.log('Настройки: ОТК недель после пошива =', otkN, ', отгрузка после ОТК =', shipN);
  console.log('Найдено цепочек для обновления:', chains.length);

  for (const chain of chains) {
    const ss = String(chain.sewing_week_start).slice(0, 10);
    const otkDate = otkN > 0 ? addWeeksToMondayIso(ss, otkN) : ss;
    const shippingDate = shipN > 0 ? addWeeksToMondayIso(otkDate, shipN) : otkDate;
    await chain.update({
      otk_week_start: otkDate,
      shipping_week_start: shippingDate,
    });
    console.log('Обновлено chain', chain.id, '| ОТК:', otkDate, '| Отгрузка:', shippingDate);
  }

  console.log('Готово.');
  await db.sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
