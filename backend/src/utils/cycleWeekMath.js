/**
 * Понедельник ISO-недели и сдвиг по календарным неделям.
 */

function mondayOf(isoDate) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addCalendarWeeks(mondayIso, deltaWeeks) {
  const d = new Date(`${mondayIso}T12:00:00`);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return mondayOf(d.toISOString().slice(0, 10));
}

function subtractCalendarWeeks(mondayIso, weeks) {
  return addCalendarWeeks(mondayIso, -weeks);
}

module.exports = { mondayOf, addCalendarWeeks, subtractCalendarWeeks };
