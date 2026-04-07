/**
 * Цеха из справочника (GET /api/workshops) и сопоставление с legacy section_id плана (floor_4, aksy, …).
 */

export const CHAIN_WORKSHOPS_FALLBACK = [
  { id: 'floor_4', name: 'Наш цех — 4 этаж' },
  { id: 'floor_3', name: 'Наш цех — 3 этаж' },
  { id: 'floor_2', name: 'Наш цех — 2 этаж' },
  { id: 'aksy', name: 'Аксы' },
  { id: 'outsource', name: 'Аутсорс цех' },
];

export function resolveWorkshopIds(workshops) {
  const list = workshops || [];
  const main =
    list.find((w) => Number(w.floors_count) === 4) || list[0] || null;
  const aksy = list.find((w) => /аксы/i.test(String(w.name || '')));
  const outsource = list.find((w) => /аутсорс/i.test(String(w.name || '')));
  return {
    mainWsId: main?.id ?? null,
    aksyId: aksy?.id ?? null,
    outsourceId: outsource?.id ?? null,
  };
}

/** Legacy ключ секции плана → id цеха из справочника (строка), если известно */
export function legacyPlanningSectionToWorkshopId(sectionKey, workshops) {
  const key = String(sectionKey || '').trim();
  if (!key) return null;
  if ((workshops || []).some((w) => String(w.id) === key)) return key;
  const { mainWsId, aksyId, outsourceId } = resolveWorkshopIds(workshops);
  if (key === 'floor_4' || key === 'floor_3' || key === 'floor_2') {
    return mainWsId != null ? String(mainWsId) : null;
  }
  if (key === 'aksy') return aksyId != null ? String(aksyId) : null;
  if (key === 'outsource') return outsourceId != null ? String(outsourceId) : null;
  return null;
}

export function effectiveChainSectionKey(doc) {
  const raw = doc?.section_id != null && doc.section_id !== '' ? doc.section_id : doc?.PlanningChain?.section_id;
  return raw != null && raw !== '' ? String(raw).trim() : '';
}

export function docMatchesChainSectionFilter(doc, filterSection, workshops) {
  if (filterSection === 'all') return true;
  const sec = effectiveChainSectionKey(doc);
  const f = String(filterSection);
  if (sec === f) return true;
  const mapped = legacyPlanningSectionToWorkshopId(sec, workshops);
  return mapped != null && mapped === f;
}

export function orderQuantityShown(order) {
  if (!order) return '—';
  const q = order.quantity ?? order.qty_order ?? order.total_quantity ?? order.amount;
  if (q == null || q === '') return '—';
  return String(q);
}

/** Подпись для значения section_id, не попавшего в список цехов */
export const LEGACY_SECTION_LABELS = {
  floor_4: 'Наш цех — 4 этаж',
  floor_3: 'Наш цех — 3 этаж',
  floor_2: 'Наш цех — 2 этаж',
  aksy: 'Аксы',
  outsource: 'Аутсорс цех',
};
