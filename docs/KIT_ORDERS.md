# Комплекты (заказы типа «set»)

## Терминология

| Сущность | Назначение |
|----------|------------|
| `orders.model_type` | `regular` — простой заказ; `set` — комплект |
| `order_parts` | Части комплекта (верх, брюки, …): `part_name`, `floor_id` (этаж здания), `planned_quantity` (равен количеству комплектов), `status` |
| `order_operations` | **Не** строки комплекта — это этапы пайплайна (раскрой/пошив/…), как в текущей ERP |
| `sewing_batches` | Факт пошива: `qty`, `floor_id`, опционально `order_part_id` → привязка к части |

## Формула

- План комплекта = одно число комплектов (`orders.total_quantity`); на каждую часть `planned_quantity` = то же число (нельзя задать разные вручную).
- Факт комплекта = **MIN**(сумма `sewing_batches.qty` по каждой части).

## API

### `POST /api/orders`

При `model_type: "set"` и `kit_parts` (≥ 2 элементов) создаются строки `order_parts`:

```json
{
  "model_type": "set",
  "kit_parts": [
    { "part_name": "Верх", "building_floor_id": 1 },
    { "part_name": "Брюки", "building_floor_id": 2 }
  ]
}
```

### `PUT /api/orders/:id/parts`

Ручное разбиение (если комплект создали без частей). После появления любой партии `sewing_batches` по заказу **изменение частей запрещено**.

### `GET /api/planning/kit-rows`

Параметры: `workshop_id`, опционально `date_from`, `date_to` (фильтр по `orders.deadline`), `building_floor_id`.

Ответ: `{ orders: [{ order_id, kit_planned, kit_completed, parts: [...] }] }`.

### `GET /api/planning/kit-summary/:orderId`

Сводка по одному заказу: `kit_planned`, `kit_completed`, `parts[]`.

## Миграция

`20260327000001-kit-order-parts-and-sewing-part-link.js` — поля `planned_quantity`, `status` в `order_parts`; `order_part_id` в `sewing_batches`.

```bash
cd backend && npx sequelize-cli db:migrate
```
