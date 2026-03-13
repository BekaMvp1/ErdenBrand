# Отчёт по анализу и исправлениям ERP — швейная фабрика

**Дата:** 13.03.2026  
**Цель:** подготовить систему к запуску в производство за 2 дня

---

## 1. Найденные проблемы

| № | Проблема | Серьёзность | Статус |
|---|----------|-------------|--------|
| 1 | Цвета этапов на доске: IN_PROGRESS был lime вместо синего | Средняя | ✅ Исправлено |
| 2 | Отсутствие progress bar (прогресс заказа по этапам) | Средняя | ✅ Исправлено |
| 3 | Дедлайн не подсвечивался красным при &lt; 3 дней | Средняя | ✅ Исправлено |
| 4 | Печать без @media print и формата A4 | Низкая | ✅ Исправлено |
| 5 | Проверка «нет размеров модели» — **не найдена** (пошив уже берёт размеры из cutting/order_variants) | — | Не требуется |
| 6 | Этапы открываются до завершения предыдущего | Архитектурная | В рекомендациях |

---

## 2. Исправленные баги

1. **Board (OrdersBoard.jsx):**
   - IN_PROGRESS: цвет изменён с lime на синий (DONE зелёный, PENDING серый, DELAY/OVERDUE красный)
   - Добавлен progress bar: `completed_stages / total_stages`
   - Дедлайн: красная подсветка при остатке &lt; 3 дней

2. **Печать (index.css):**
   - Добавлен `@media print` с форматом A4
   - Скрытие `.no-print` при печати
   - Поддержка `.print-area` и `.print-only`

---

## 3. Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `frontend/src/pages/OrdersBoard.jsx` | STATUS_STYLE (синий IN_PROGRESS), PENDING/DELAY, progress bar, `daysUntilDeadline`, красный дедлайн &lt; 3 дней |
| `frontend/src/index.css` | Блок `@media print` (A4, no-print, print-area) |

---

## 4. Проверка производственного потока

| Этап | Источник данных | Переход к следующему |
|------|-----------------|----------------------|
| Закуп | procurement_requests | Статус received |
| Планирование | production_plan_day, order_operations | План сохранён |
| Раскрой | cutting_tasks (actual_variants) | Статус «Готово» |
| Пошив | sewing_fact, sewing_batches | POST /api/sewing/complete → партия READY_FOR_QC |
| ОТК | qc_batches | POST /api/warehouse-stock/qc/batch → QC_DONE |
| Склад | warehouse_stock | Автоматически после ОТК |
| Отгрузка | shipments | status DONE |

**Пошив:** размеры берутся из `actual_variants` (раскрой) или `order_variants` (заказ). Проверки на справочник размеров модели нет.

---

## 5. Проверка базы данных

Основные таблицы (миграции):

- `orders` ✅
- `order_variants` (order_items) ✅
- `procurement_requests` ✅
- `production_plan_day` ✅
- `cutting_tasks` (cutting_tasks) ✅
- `sewing_batches` ✅
- `qc_batches` ✅
- `warehouse_stock` (остатки) ✅

Примечание: `cutting_batches` и `warehouse_items` в вашем списке — в проекте используются `cutting_tasks` и `warehouse_stock` / `warehouse_movements`.

---

## 6. Рекомендации по стабильности

1. **Этапы по цепочке:** Добавить проверку при открытии этапа: если предыдущий не DONE — показывать предупреждение или блокировать ввод. Сейчас этапы открываются по клику, проверки нет.

2. **Резервное копирование:** Настроить регулярный бэкап PostgreSQL перед запуском в производство.

3. **Семантика `order_stages`:** Для корректного progress bar и production_stages нужна актуальная запись в `order_stages` при переходах (procurement DONE → planning IN_PROGRESS и т.д.). Проверить, что warehouseStock, sewing, cutting при завершении обновляют order_stages.

4. **Печать списков:** Procurement, Cutting, Sewing уже имеют `.print-area`. PrintButton печатает текущую страницу. Отдельные документы: `/print/procurement/:id`, `/print/cutting/:id`, `/print/sewing/:id`.

5. **Упрощение UI:** Сохранить только необходимые кнопки; лишние модалки можно убрать после аудита использования.

---

## 7. Diff (ключевые фрагменты)

### OrdersBoard.jsx

```diff
- IN_PROGRESS: 'bg-lime-500/25 text-lime-200 ...'
+ IN_PROGRESS: 'bg-blue-500/25 text-blue-200 ...'
+ PENDING: 'bg-slate-700/40 ...'
+ DELAY: 'bg-red-500/25 ...'

+ function daysUntilDeadline(deadlineIso) { ... }

+ {/* Progress bar */}
+ <div className="h-1 ..."><div style={{ width: `${percent}%` }} /></div>

+ {/* Deadline < 3 days → red */}
+ d != null && d >= 0 && d < 3 ? 'text-red-300' : 'text-slate-100'
```

### index.css

```diff
+ @media print {
+   @page { size: A4; margin: 12mm; }
+   .no-print { display: none !important; }
+   .print-area, .print-area * { color: black !important; background: white !important; }
+ }
```
