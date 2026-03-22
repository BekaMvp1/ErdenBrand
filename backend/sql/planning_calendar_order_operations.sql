-- Заказы для календаря планирования: только те, у которых есть order_operations на выбранном этаже (и цех совпадает).

-- Вариант с этажом (building_floors.id = :floor_id)
SELECT DISTINCT op.order_id
FROM order_operations op
INNER JOIN orders o ON o.id = op.order_id
WHERE o.workshop_id = :workshop_id
  AND op.floor_id = :floor_id;

-- Цех без фильтра этажа (все операции по заказам цеха)
SELECT DISTINCT op.order_id
FROM order_operations op
INNER JOIN orders o ON o.id = op.order_id
WHERE o.workshop_id = :workshop_id;
