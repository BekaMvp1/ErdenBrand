/**
 * Логика комплектов (двойка, тройка).
 * Комплект = MIN(количество по всем частям).
 * Остаток по части = часть - комплект.
 */

/**
 * Вычислить количество комплектов и остатки по частям.
 * @param {Array<{part_name: string, floor_id: number}>} parts - части заказа из order_parts
 * @param {Object} partQuantitiesByFloor - { [floor_id]: number } количество по каждому этажу
 * @returns {{ kit_qty: number, part_quantities: Array<{part_name, floor_id, qty, remainder}> }}
 */
function computeKitSummary(parts, partQuantitiesByFloor) {
  if (!parts || parts.length === 0) {
    return { kit_qty: 0, part_quantities: [] };
  }
  const part_quantities = parts.map((p) => {
    const qty = partQuantitiesByFloor[Number(p.floor_id)] ?? 0;
    return {
      part_name: p.part_name,
      floor_id: p.floor_id,
      qty,
    };
  });
  const kit_qty = part_quantities.length > 0
    ? Math.min(...part_quantities.map((x) => x.qty))
    : 0;
  part_quantities.forEach((p) => {
    p.remainder = Math.max(0, p.qty - kit_qty);
  });
  return { kit_qty, part_quantities };
}

module.exports = { computeKitSummary };
