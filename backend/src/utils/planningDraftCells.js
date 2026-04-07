/**
 * Недели месяца (как на фронте PlanningDraft) и слияние дневных ячеек в недельные поля payload.
 */

const { Op } = require('sequelize');

function getMonday(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getWeekDates(weekStart) {
  const dates = [];
  const d = new Date(`${weekStart}T12:00:00`);
  for (let i = 0; i < 6; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function getWeeksInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const weeks = [];
  let mon = getMonday(first);
  let weekNum = 1;
  while (mon <= last) {
    const sun = new Date(`${mon}T12:00:00`);
    sun.setDate(sun.getDate() + 6);
    const dateTo = sun.toISOString().slice(0, 10);
    const dates = getWeekDates(mon);
    const inMonth = dates.some((dt) => dt >= first && dt <= last);
    if (inMonth) {
      weeks.push({
        weekNum,
        label: `${weekNum} неделя`,
        dateFrom: mon,
        dateTo,
      });
      weekNum++;
    }
    const next = new Date(`${mon}T12:00:00`);
    next.setDate(next.getDate() + 7);
    mon = next.toISOString().slice(0, 10);
  }
  return weeks;
}

function parseNum(v) {
  if (v === '' || v == null) return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function numToCellStr(n) {
  if (!Number.isFinite(n) || n === 0) return '';
  return String(Math.round(n * 1000) / 1000);
}

/**
 * Срез из 4 недель как на фронте (week_slice_start).
 */
function displayWeeksSlice(monthKey, weekSliceStart) {
  const all = getWeeksInMonth(monthKey);
  const ws = Math.max(0, parseInt(weekSliceStart, 10) || 0);
  const maxStart = Math.max(0, all.length - 4);
  const start = Math.min(ws, maxStart);
  const slice = all.slice(start, start + 4);
  const out = [...slice];
  while (out.length < 4) {
    out.push({ weekNum: '—', label: '—', dateFrom: '', dateTo: '' });
  }
  return out;
}

/**
 * Индекс недели среза (0–3), в которую попадает дата, или -1.
 */
function weekIndexForDate(displayWeeks, isoDate) {
  if (!isoDate) return -1;
  for (let i = 0; i < displayWeeks.length; i++) {
    const w = displayWeeks[i];
    if (w.dateFrom && w.dateTo && isoDate >= w.dateFrom && isoDate <= w.dateTo) return i;
  }
  return -1;
}

/**
 * @param {object} payload — { version, week_slice_start, sections: [...] }
 * @param {Array<{row_id, date, cell_key, cell_value}>} cellRows
 */
function mergeCellsIntoPayloadSections(payload, cellRows) {
  if (!payload || !Array.isArray(payload.sections)) return payload;
  const monthKey = payload._merge_month_key;
  const ws = payload.week_slice_start;
  if (!monthKey) return payload;

  const displayWeeks = displayWeeksSlice(monthKey, ws);
  const sums = {};
  for (const r of cellRows || []) {
    const rid = String(r.row_id);
    const dk = String(r.cell_key || '').toLowerCase();
    if (!['pp', 'pf', 'mp', 'mf'].includes(dk)) continue;
    const d = r.date ? String(r.date).slice(0, 10) : '';
    if (!d) continue;
    const wi = weekIndexForDate(displayWeeks, d);
    if (wi < 0) continue;
    const key = `${rid}|${wi}|${dk}`;
    sums[key] = (sums[key] || 0) + parseNum(r.cell_value);
  }

  const hasAnyCellForBucket = {};
  for (const r of cellRows || []) {
    const rid = String(r.row_id);
    const d = r.date ? String(r.date).slice(0, 10) : '';
    const wi = weekIndexForDate(displayWeeks, d);
    if (wi < 0) continue;
    hasAnyCellForBucket[`${rid}|${wi}`] = true;
  }

  const sections = payload.sections.map((sec) => {
    if (sec.type !== 'section') return sec;
    return {
      ...sec,
      subsections: (sec.subsections || []).map((sub) => ({
        ...sub,
        rows: (sub.rows || []).map((row) => {
          const rid = String(row.id || '');
          const weeks = Array.isArray(row.weeks) ? [...row.weeks] : [{}, {}, {}, {}];
          while (weeks.length < 4) weeks.push({ pp: '', pf: '', mp: '', mf: '' });
          const newWeeks = weeks.slice(0, 4).map((w, wi) => {
            const base = { pp: w.pp ?? '', pf: w.pf ?? '', mp: w.mp ?? '', mf: w.mf ?? '' };
            if (!hasAnyCellForBucket[`${rid}|${wi}`]) return base;
            const pick = (dk) => {
              const k = `${rid}|${wi}|${dk}`;
              if (!Object.prototype.hasOwnProperty.call(sums, k)) return base[dk];
              const n = sums[k] || 0;
              return n === 0 ? '' : numToCellStr(n);
            };
            return {
              pp: pick('pp'),
              pf: pick('pf'),
              mp: pick('mp'),
              mf: pick('mf'),
            };
          });
          return { ...row, weeks: newWeeks };
        }),
      })),
    };
  });

  const { _merge_month_key, ...rest } = payload;
  return { ...rest, sections };
}

async function deleteCellsForMonthInScope(db, userId, scopeKey, monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  await db.PlanningDraftCell.destroy({
    where: {
      user_id: userId,
      scope_key: scopeKey,
      date: { [Op.between]: [first, last] },
    },
  });
}

async function replaceDayCellsBatch(db, userId, scopeKey, cells) {
  if (!Array.isArray(cells)) return;
  const dates = [
    ...new Set(
      cells
        .map((c) => (c.date ? String(c.date).slice(0, 10) : ''))
        .filter(Boolean)
    ),
  ];
  if (dates.length > 0) {
    await db.PlanningDraftCell.destroy({
      where: { user_id: userId, scope_key: scopeKey, date: { [Op.in]: dates } },
    });
  }
  const rows = cells
    .map((c) => ({
      user_id: userId,
      scope_key: scopeKey,
      row_id: String(c.row_id || '').slice(0, 80),
      section_key: String(c.section_key || '').slice(0, 64),
      subsection_key: String(c.subsection_key || '').slice(0, 64),
      date: c.date ? String(c.date).slice(0, 10) : null,
      cell_key: String(c.cell_key || '').toLowerCase().slice(0, 2),
      cell_value: c.cell_value != null ? String(c.cell_value).slice(0, 32) : '',
    }))
    .filter(
      (c) =>
        c.row_id &&
        c.date &&
        ['pp', 'pf', 'mp', 'mf'].includes(c.cell_key) &&
        String(c.cell_value).trim() !== ''
    );
  if (rows.length > 0) {
    await db.PlanningDraftCell.bulkCreate(rows);
  }
}

async function listCellsForScope(db, userId, scopeKey) {
  return db.PlanningDraftCell.findAll({
    where: { user_id: userId, scope_key: scopeKey },
    raw: true,
    order: [['date', 'ASC'], ['row_id', 'ASC'], ['cell_key', 'ASC']],
  });
}

module.exports = {
  getWeeksInMonth,
  getWeekDates,
  getMonday,
  displayWeeksSlice,
  mergeCellsIntoPayloadSections,
  deleteCellsForMonthInScope,
  replaceDayCellsBatch,
  listCellsForScope,
  parseNum,
  numToCellStr,
};
