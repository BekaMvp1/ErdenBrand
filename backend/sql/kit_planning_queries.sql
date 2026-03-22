-- Справочные запросы: комплекты (order_parts) и факт из sewing_batches.
-- Комплект по количеству = MIN(факт по каждой части).

-- Факт по части заказа (связь партии с частью или совпадение этажа)
-- :order_id, :part_id, :floor_id
SELECT COALESCE(SUM(sb.qty), 0)::int AS completed_qty
FROM sewing_batches sb
WHERE sb.order_id = :order_id
  AND (
    sb.order_part_id = :part_id
    OR (sb.order_part_id IS NULL AND sb.floor_id IS NOT DISTINCT FROM :floor_id)
  );

-- План и факт по всем частям заказа-комплекта
SELECT
  op.id,
  op.part_name,
  op.floor_id,
  COALESCE(op.planned_quantity, o.total_quantity)::int AS planned,
  COALESCE((
    SELECT SUM(sb.qty)::bigint
    FROM sewing_batches sb
    WHERE sb.order_id = o.id
      AND (sb.order_part_id = op.id
        OR (sb.order_part_id IS NULL AND sb.floor_id IS NOT DISTINCT FROM op.floor_id))
  ), 0)::int AS completed
FROM orders o
JOIN order_parts op ON op.order_id = o.id
WHERE o.id = :order_id AND o.model_type = 'set';

-- Количество комплектов по факту = MIN(completed) по строкам выше (в приложении или подзапросом)
-- SELECT MIN(completed) FROM (...)
