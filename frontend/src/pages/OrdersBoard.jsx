/**
 * Страница: Панель заказов (оперативная доска)
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useOrderProgress } from '../context/OrderProgressContext';
import { Chip, NeonButton, NeonCard, NeonInput, NeonSelect } from '../components/ui';
import PrintButton from '../components/PrintButton';

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'overdue', label: 'Просроченные' },
  { key: 'today', label: 'Сегодня' },
  { key: 'done', label: 'Готово' },
  { key: 'not_done', label: 'Не готово' },
  { key: 'future', label: 'Будущие' },
];

const PRIORITIES = [
  { key: '', label: 'Все приоритеты' },
  { key: 'high', label: 'Высокий' },
  { key: 'medium', label: 'Средний' },
  { key: 'normal', label: 'Обычный' },
  { key: 'low', label: 'Низкий' },
];

const SORTS = [
  { key: 'priority', label: 'Приоритет' },
  { key: 'deadline', label: 'Дедлайн' },
  { key: 'forecast', label: 'Прогноз' },
];

const VIEW_MODES = [
  { key: 'schedule', label: 'Сроки' },
  { key: 'fact_plan', label: 'Факт/план' },
];

// Стили этапов: DONE зелёный, IN_PROGRESS синий, PENDING/NOT_STARTED серый, DELAY/OVERDUE красный
const STATUS_STYLE = {
  DONE:
    'bg-emerald-500/30 text-emerald-200 border-emerald-400/60 shadow-[0_0_0_1px_rgba(52,211,153,0.35)]',
  IN_PROGRESS:
    'bg-blue-500/25 text-blue-200 border-blue-400/50 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]',
  NOT_STARTED: 'bg-slate-700/40 text-slate-400 border-slate-500/30',
  PENDING: 'bg-slate-700/40 text-slate-400 border-slate-500/30',
  OVERDUE: 'bg-red-500/25 text-red-300 border-red-400/50 shadow-[0_0_0_1px_rgba(248,113,113,0.3)]',
  DELAY: 'bg-red-500/25 text-red-300 border-red-400/50 shadow-[0_0_0_1px_rgba(248,113,113,0.3)]',
};

// Производственная цепочка: Закуп → Планирование → Раскрой → Пошив → ОТК → Склад → Отгрузка
const STAGE_COLUMNS = [
  { key: 'procurement', title: 'ЗАКУП' },
  { key: 'planning', title: 'ПЛАНИРОВАНИЕ' },
  { key: 'cutting', title: 'РАСКРОЙ' },
  { key: 'sewing', title: 'ПОШИВ' },
  { key: 'qc', title: 'ОТК' },
  { key: 'warehouse', title: 'СКЛАД' },
  { key: 'shipping', title: 'ОТГРУЗКА' },
];

const COL_WIDTHS = {
  client: 280,
  priority: 72,
  created: 132,
  stage: 146,
  forecast: 140,
  deadline: 140,
};

const GRID_TEMPLATE = `${COL_WIDTHS.client}px ${COL_WIDTHS.priority}px ${COL_WIDTHS.created}px repeat(${STAGE_COLUMNS.length}, ${COL_WIDTHS.stage}px) ${COL_WIDTHS.forecast}px ${COL_WIDTHS.deadline}px`;
const GRID_MIN_WIDTH = COL_WIDTHS.client + COL_WIDTHS.priority + COL_WIDTHS.created + STAGE_COLUMNS.length * COL_WIDTHS.stage + COL_WIDTHS.forecast + COL_WIDTHS.deadline;
const UNIFIED_BOX_CLASS = 'w-full min-h-full rounded-lg border border-white/15 bg-slate-900/45 p-2.5 text-sm';

/** Превью заказа: строка из photos[0], объекта с url или image_url */
function boardOrderThumbSrc(orderRow) {
  const p = orderRow.photos?.[0];
  if (typeof p === 'string' && p.trim()) return p.trim();
  if (p && typeof p === 'object' && typeof p.url === 'string' && p.url.trim()) return p.url.trim();
  if (typeof orderRow.image_url === 'string' && orderRow.image_url.trim()) return orderRow.image_url.trim();
  return null;
}

/** Компактные бейджи цепочки (ключи как в orderProgress.progress) */
const BOARD_COMPACT_STAGES = [
  { progressKey: 'purchase', label: 'Закуп', stageKey: 'procurement' },
  { progressKey: 'cutting', label: 'Раскрой', stageKey: 'cutting' },
  { progressKey: 'sewing', label: 'Пошив', stageKey: 'sewing' },
  { progressKey: 'otk', label: 'ОТК', stageKey: 'qc' },
  { progressKey: 'warehouse', label: 'Склад', stageKey: 'warehouse' },
  { progressKey: 'shipping', label: 'Отгрузка', stageKey: 'shipping' },
];

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ru-RU');
  } catch {
    return value;
  }
}

function priorityBadge(priority) {
  if (priority === 'high') return 'bg-red-500/25 text-red-300';
  if (priority === 'medium') return 'bg-amber-500/25 text-amber-300';
  if (priority === 'low') return 'bg-green-500/25 text-green-300';
  return 'bg-slate-500/25 text-slate-200';
}

function priorityNum(priority) {
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

/** Дней до дедлайна (положительное = ещё есть время) */
function daysUntilDeadline(deadlineIso) {
  if (!deadlineIso) return null;
  const today = new Date().toISOString().slice(0, 10);
  const diff = Math.floor((new Date(deadlineIso) - new Date(today)) / (24 * 60 * 60 * 1000));
  return diff;
}

function formatDaysLabel(days) {
  const val = Number(days) || 0;
  if (val <= 0) return '-';
  const mod10 = val % 10;
  const mod100 = val % 100;
  if (mod10 === 1 && mod100 !== 11) return `${val} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${val} дня`;
  return `${val} дней`;
}

/** URL перехода при клике по этапу: открываем соответствующий модуль с фильтром по заказу */
function getStageUrl(orderId, stageKey) {
  switch (stageKey) {
    case 'procurement':
      return `/procurement?order_id=${orderId}`;
    case 'planning':
      return `/planning?order_id=${orderId}`;
    case 'cutting':
      return `/cutting?order_id=${orderId}`;
    case 'sewing':
      return `/sewing?order_id=${orderId}`;
    case 'qc':
      return `/otk?order_id=${orderId}`;
    case 'warehouse':
      return `/warehouse?order_id=${orderId}`;
    case 'shipping':
      return `/shipments?order_id=${orderId}`;
    default:
      return `/orders/${orderId}?stage=${stageKey}`;
  }
}

function calcFilterCounters(orders) {
  const today = new Date().toISOString().slice(0, 10);
  const doneCheck = (o) => (o.stages || []).every((s) => s.status === 'DONE');
  return orders.reduce(
    (acc, row) => {
      const isDone = doneCheck(row);
      acc.all += 1;
      if (row.is_overdue) acc.overdue += 1;
      if (row.deadline === today) acc.today += 1;
      if (isDone) acc.done += 1;
      if (!isDone) acc.not_done += 1;
      if (row.deadline && row.deadline > today) acc.future += 1;
      return acc;
    },
    { all: 0, overdue: 0, today: 0, done: 0, not_done: 0, future: 0 }
  );
}

/**
 * Ячейка этапа: заполняет ячейку до краёв, единый шаблон, подсветка по статусу (DONE / IN_PROGRESS / NOT_STARTED).
 */
function StageCell({ stage, viewMode, orderId, onOpenStage }) {
  const hasActual =
    (stage.actual_days != null && stage.actual_days >= 0) || stage.actual_start_date || stage.actual_end_date;
  const hasPlanned = (stage.planned_days || 0) > 0 && stage.planned_start_date;
  const hasSchedule = hasActual || hasPlanned;
  const statusClass = STATUS_STYLE[stage.status] || STATUS_STYLE.NOT_STARTED;
  const isDone = stage.status === 'DONE';
  const isProgress = stage.status === 'IN_PROGRESS';

  const daysLabel = hasActual && stage.actual_days != null
    ? formatDaysLabel(stage.actual_days)
    : hasPlanned
      ? formatDaysLabel(stage.planned_days)
      : '—';
  const startDate = stage.actual_start_date || stage.planned_start_date;
  const endDate = stage.actual_end_date || stage.planned_end_date;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenStage(orderId, stage.stage_key);
      }}
      className={`absolute inset-0 w-full h-full rounded-md border p-1.5 text-left transition hover:brightness-110 flex flex-col ${statusClass}`}
      title={stage.title_ru}
    >
      <div className="flex items-center justify-between gap-0.5 min-h-0 flex-shrink-0">
        <span className="text-[10px] font-semibold tracking-wide truncate">{stage.title_ru}</span>
        {isDone && <span className="text-emerald-300 text-[10px] flex-shrink-0" aria-hidden>✓</span>}
        {isProgress && <span className="text-blue-300 text-[9px] flex-shrink-0 opacity-90">В работе</span>}
      </div>
      {viewMode === 'schedule' ? (
        <div className="mt-0.5 space-y-0.5 flex-1 min-h-0">
          <div className="text-xs font-semibold leading-tight">{daysLabel}</div>
          <div className="text-[10px] leading-tight opacity-90">{hasSchedule && startDate ? formatDate(startDate) : '—'}</div>
          <div className="text-[10px] leading-tight opacity-90">{hasSchedule && endDate ? formatDate(endDate) : '—'}</div>
        </div>
      ) : (
        <div className="mt-1 flex-1 min-h-0 flex flex-col justify-center">
          <div className="text-base font-bold leading-tight">
            {stage.actual_qty}/{stage.planned_qty}
          </div>
          <div className="text-[11px] opacity-90">{stage.percent}%</div>
        </div>
      )}
    </button>
  );
}

function UnifiedCellBox({ className = '', children }) {
  return <div className={`${UNIFIED_BOX_CLASS} ${className}`}>{children}</div>;
}

function BoardHeader({
  q,
  setQ,
  workshopId,
  setWorkshopId,
  workshops,
  priority,
  setPriority,
  showCompleted,
  setShowCompleted,
  filter,
  setFilter,
  filterCounters,
  sort,
  setSort,
  order,
  setOrder,
  viewMode,
  setViewMode,
}) {
  return (
    <div className="no-print sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 backdrop-blur px-3 md:px-6 lg:px-8 py-3 md:py-4">
      <div className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3 w-full min-w-0">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-wide text-neon-text shrink-0">ЗАКАЗЫ</h1>
          <PrintButton />

          <div className="w-full lg:w-[260px] lg:max-w-full lg:shrink-0 min-w-0">
            <NeonInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по номеру, модели, артикулу, клиенту"
              className="h-[42px] py-2 w-full"
            />
          </div>

          <div className="w-full sm:w-[160px] sm:shrink-0 min-w-0">
            <NeonSelect value={priority} onChange={(e) => setPriority(e.target.value)} className="h-[42px] w-full max-w-full py-2">
              {PRIORITIES.map((item) => (
                <option key={item.key || 'all'} value={item.key}>
                  {item.label}
                </option>
              ))}
            </NeonSelect>
          </div>

          <NeonButton
            variant={sort === 'forecast' ? 'primary' : 'secondary'}
            onClick={() => setSort('forecast')}
            className="h-[42px] w-full sm:w-[120px] sm:shrink-0 px-3 py-2 text-xs"
          >
            Прогноз
          </NeonButton>

          <div className="flex h-[42px] w-full sm:w-[190px] sm:shrink-0 items-center justify-center gap-2 rounded-lg border border-white/15 bg-slate-900/80 px-3 py-2 whitespace-nowrap">
            <input
              id="showCompleted"
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="h-4 w-4 accent-lime-500"
            />
            <label htmlFor="showCompleted" className="text-sm text-slate-200">
              Завершенные
            </label>
          </div>

          <Link to="/production-dashboard" className="w-full sm:w-auto">
            <NeonButton variant="secondary" className="h-[42px] w-full sm:w-auto sm:shrink-0 px-3 py-2 text-sm whitespace-nowrap">
              Открыть дашборд
            </NeonButton>
          </Link>

          <div className="w-full sm:w-[180px] sm:shrink-0 min-w-0">
            <NeonSelect
              value={workshopId}
              onChange={(e) => setWorkshopId(e.target.value)}
              className="h-[42px] py-2 w-full"
            >
              <option value="">Все цеха</option>
              {workshops.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </NeonSelect>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 gap-y-3">
          {FILTERS.map((item) => (
            <Chip key={item.key} onClick={() => setFilter(item.key)} active={filter === item.key}>
              <span className="inline-flex items-center gap-1">
                <span>{item.label}</span>
                {(filterCounters[item.key] || 0) > 0 && (
                  <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] leading-none">
                    {filterCounters[item.key]}
                  </span>
                )}
              </span>
            </Chip>
          ))}

          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            <div className="flex h-[44px] items-center gap-1 rounded-xl border border-white/10 bg-black/20 px-2 shrink-0">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode.key}
                  onClick={() => setViewMode(mode.key)}
                  type="button"
                  className={`h-[34px] min-w-[92px] rounded-lg px-3 text-sm whitespace-nowrap transition ${
                    viewMode === mode.key
                      ? 'bg-white/10 text-neon-text'
                      : 'bg-transparent text-neon-muted hover:bg-white/5 hover:text-neon-text'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div className="w-[150px] shrink-0">
              <NeonSelect
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="h-[44px] w-full max-w-full px-3 py-2"
              >
                {SORTS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </NeonSelect>
            </div>
            <NeonButton
              onClick={() => setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              variant="secondary"
              className="h-[44px] shrink-0 px-3 py-2 text-sm whitespace-nowrap"
            >
              {order === 'asc' ? '↑ ASC' : '↓ DESC'}
            </NeonButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardRow({ orderRow, viewMode, onOpenOrder, onOpenStage, orderProgress }) {
  const rowBase = 'border-b border-white/10';
  const stickyLeft = 'sticky z-10 bg-slate-950/95';
  const stickyRight = 'sticky z-10 bg-slate-950/95';
  const rowMinH = 'min-h-[80px]';
  const thumbSrc = boardOrderThumbSrc(orderRow);
  const totalPct = Math.min(
    100,
    orderProgress?.total_progress ??
      orderRow.done_percent_total ??
      (orderRow.production_stages?.length
        ? Math.round(
            (orderRow.production_stages.filter((s) => s.status === 'DONE').length /
              orderRow.production_stages.length) *
              100
          )
        : 0)
  );

  return (
    <div
      className={`${rowBase} grid ${rowMinH} cursor-pointer`}
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
      onClick={() => onOpenOrder(orderRow.id)}
    >
      <div className={`${stickyLeft} left-0 border-r border-white/10 px-0 flex flex-col ${rowMinH}`}>
        <UnifiedCellBox className="flex flex-1 items-start gap-2.5 py-2 min-h-0 !p-2">
          <div className="relative h-[52px] w-[52px] shrink-0">
            {thumbSrc ? (
              <img
                src={thumbSrc}
                alt=""
                className="h-[52px] w-[52px] rounded-md object-cover border border-[#333]/80"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const next = e.currentTarget.nextElementSibling;
                  if (next instanceof HTMLElement) next.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="absolute inset-0 flex h-[52px] w-[52px] items-center justify-center rounded-md border border-[#222] bg-[#111] text-[9px] text-[#333]"
              style={{ display: thumbSrc ? 'none' : 'flex' }}
            >
              фото
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex min-w-0 items-center gap-1.5">
              {orderRow.workshop_name && orderRow.workshop_name !== '—' && (
                <span className="shrink-0 rounded px-1 py-px text-[10px] bg-[#1a1a2e] text-[#4a9eff]">
                  {orderRow.workshop_name}
                </span>
              )}
              <div className="min-w-0 truncate text-xs font-semibold text-white">
                {orderRow.total_quantity != null && orderRow.total_quantity > 0 && (
                  <span className="text-slate-300">{orderRow.total_quantity} — </span>
                )}
                {orderRow.article ? `${orderRow.article} — ` : ''}
                {orderRow.model_name || '—'}
                {orderRow.display_index != null && (
                  <span className="ml-1 text-slate-500">№{orderRow.display_index}</span>
                )}
              </div>
            </div>
            <div
              className="mb-0.5 flex flex-nowrap gap-0.5 overflow-hidden"
              style={{ marginTop: 4 }}
            >
              {BOARD_COMPACT_STAGES.map((stage) => {
                const stageRow = (orderRow.stages || []).find((s) => s.stage_key === stage.stageKey);
                const pct =
                  orderProgress?.progress?.[stage.progressKey] ??
                  (typeof stageRow?.percent === 'number' ? stageRow.percent : 0);
                const done = stageRow?.status === 'DONE' || pct >= 100;
                const inProgress = !done && stageRow?.status === 'IN_PROGRESS';
                const started = pct > 0 || inProgress;
                const mark = done ? '✓' : inProgress ? '⏳' : '○';
                return (
                  <span
                    key={stage.progressKey}
                    className="whitespace-nowrap rounded px-[5px] py-0.5 text-[10px] leading-tight border border-solid"
                    style={{
                      background: done
                        ? 'rgba(200,255,0,0.12)'
                        : started
                          ? 'rgba(74,158,255,0.1)'
                          : 'rgba(255,255,255,0.04)',
                      color: done ? '#c8ff00' : started ? '#4a9eff' : '#444',
                      borderColor: done
                        ? 'rgba(200,255,0,0.2)'
                        : started
                          ? 'rgba(74,158,255,0.15)'
                          : '#222',
                    }}
                  >
                    {mark} {stage.label}
                  </span>
                );
              })}
            </div>
            <div className="h-[3px] w-full overflow-hidden rounded-sm bg-[#1a1a1a]">
              <div
                className="h-[3px] rounded-sm transition-[width] duration-500"
                style={{
                  width: `${totalPct}%`,
                  background: totalPct >= 100 ? '#c8ff00' : '#4a9eff',
                }}
              />
            </div>
          </div>
        </UnifiedCellBox>
      </div>

      <div className={`${stickyLeft} border-r border-white/10 px-0 flex flex-col ${rowMinH}`} style={{ left: `${COL_WIDTHS.client}px` }}>
        <UnifiedCellBox className="flex flex-1 items-center justify-center min-h-0">
          <div className={`w-full flex items-center justify-center rounded-md py-1 text-xs font-semibold ${priorityBadge(orderRow.priority)}`}>
            {priorityNum(orderRow.priority)}
          </div>
        </UnifiedCellBox>
      </div>

      <div className={`${stickyLeft} border-r border-white/10 px-0 flex flex-col ${rowMinH}`} style={{ left: `${COL_WIDTHS.client + COL_WIDTHS.priority}px` }}>
        <UnifiedCellBox className="flex flex-1 items-center justify-center text-center text-xs text-slate-300 min-h-0">
          {formatDate(orderRow.created_at)}
        </UnifiedCellBox>
      </div>

      {STAGE_COLUMNS.map((stageCol) => {
        const stage = (orderRow.stages || []).find((s) => s.stage_key === stageCol.key);
        return (
          <div
            key={`${orderRow.id}-${stageCol.key}`}
            className={`border-r border-white/10 p-0 relative ${rowMinH}`}
          >
            {stage ? (
              <StageCell
                stage={stage}
                viewMode={viewMode}
                orderId={orderRow.id}
                onOpenStage={onOpenStage}
              />
            ) : (
              <div className="absolute inset-0 w-full h-full flex items-center justify-center text-sm text-slate-500 bg-slate-800/30 border border-transparent rounded-md">
                —
              </div>
            )}
          </div>
        );
      })}

      <div className={`${stickyRight} border-l border-white/10 px-0 flex flex-col ${rowMinH}`} style={{ right: `${COL_WIDTHS.deadline}px` }}>
        <UnifiedCellBox className="flex flex-1 items-center justify-center flex-col text-center min-h-0">
          <div className="text-[10px] text-slate-400">Прогноз</div>
          <div
            className={`mt-1 text-xs font-semibold ${
              orderRow.forecast_date && orderRow.deadline && orderRow.forecast_date > orderRow.deadline ? 'text-amber-300' : 'text-slate-100'
            }`}
          >
            {formatDate(orderRow.forecast_date)}
          </div>
        </UnifiedCellBox>
      </div>

      <div className={`${stickyRight} right-0 border-l border-white/10 px-0 flex flex-col ${rowMinH}`}>
        <UnifiedCellBox className="flex flex-1 items-center justify-center flex-col text-center min-h-0">
          <div className="text-[10px] text-slate-400">Сдача</div>
          <div
            className={`mt-1 text-xs font-semibold ${
              orderRow.is_overdue ? 'text-red-300' : (() => {
                const d = daysUntilDeadline(orderRow.deadline);
                return d != null && d >= 0 && d < 3 ? 'text-red-300' : 'text-slate-100';
              })()
            }`}
          >
            {formatDate(orderRow.deadline)}
          </div>
        </UnifiedCellBox>
      </div>
    </div>
  );
}

export default function OrdersBoard() {
  const navigate = useNavigate();
  const { ordersProgress } = useOrderProgress();
  const progressByOrderId = useMemo(() => {
    const m = new Map();
    (ordersProgress || []).forEach((p) => m.set(Number(p.id), p));
    return m;
  }, [ordersProgress]);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [workshops, setWorkshops] = useState([]);
  const [workshopId, setWorkshopId] = useState('');
  // Фильтр из URL для перехода с дашборда (например /board?filter=overdue)
  const [filter, setFilter] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const f = p.get('filter');
    return FILTERS.some((x) => x.key === f) ? f : 'all';
  });
  const [priority, setPriority] = useState('');
  // По умолчанию показываем все заказы (в т.ч. готовые), иначе при одном готовом заказе доска пустая
  const [showCompleted, setShowCompleted] = useState(true);
  const [sort, setSort] = useState('deadline');
  const [order, setOrder] = useState('asc');
  const [viewMode, setViewMode] = useState('schedule');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState({ pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }, orders: [] });

  useEffect(() => {
    api.workshops.list().then(setWorkshops).catch(() => setWorkshops([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, workshopId, filter, priority, showCompleted, sort, order]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await api.board.getOrders({
          q: debouncedQ || undefined,
          workshop_id: workshopId || undefined,
          filter,
          priority: priority || undefined,
          showCompleted: String(showCompleted),
          sort,
          order,
          page,
          limit,
        });
        if (!cancelled) setData(response);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Ошибка загрузки панели заказов');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, workshopId, filter, priority, showCompleted, sort, order, page, limit]);

  const hasOrders = data.orders && data.orders.length > 0;
  const pagination = data.pagination || { page: 1, totalPages: 1, total: 0 };
  const filterCounters = useMemo(() => calcFilterCounters(data.orders || []), [data.orders]);

  const onOpenOrder = (id) => navigate(`/orders/${id}`);
  const onOpenStage = (id, stageKey) => navigate(getStageUrl(id, stageKey));

  return (
    <section className="min-h-full overflow-x-hidden text-neon-text">
      <BoardHeader
        q={q}
        setQ={setQ}
        workshopId={workshopId}
        setWorkshopId={setWorkshopId}
        workshops={workshops}
        priority={priority}
        setPriority={setPriority}
        showCompleted={showCompleted}
        setShowCompleted={setShowCompleted}
        filter={filter}
        setFilter={setFilter}
        filterCounters={filterCounters}
        sort={sort}
        setSort={setSort}
        order={order}
        setOrder={setOrder}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      <div className="p-3 md:p-4">
        {loading && <NeonCard className="p-4 text-sm text-neon-muted">Загрузка...</NeonCard>}
        {!loading && error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

        {!loading && !error && !hasOrders && (
          <NeonCard className="p-8 text-center text-neon-muted">
            Заказы не найдены по текущим фильтрам
          </NeonCard>
        )}

        {!loading && !error && hasOrders && (
          <div className="rounded-card border border-white/10 bg-slate-950/35">
            <div className="max-h-[calc(100vh-320px)] overflow-auto">
              <div style={{ minWidth: `${GRID_MIN_WIDTH}px` }}>
                {/* Шапка таблицы со sticky-позиционированием */}
                <div className="sticky top-0 z-20 grid border-b border-white/15 bg-slate-950/95 text-[11px] font-semibold tracking-wide text-slate-300" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                  <div className="sticky left-0 z-30 border-r border-white/15 px-3 py-3">КЛИЕНТ</div>
                  <div className="sticky z-30 border-r border-white/15 px-2 py-3 text-center" style={{ left: `${COL_WIDTHS.client}px` }}>ПР</div>
                  <div className="sticky z-30 border-r border-white/15 px-2 py-3 text-center" style={{ left: `${COL_WIDTHS.client + COL_WIDTHS.priority}px` }}>ДАТА ОФОРМ.</div>
                  {STAGE_COLUMNS.map((col) => (
                    <div key={col.key} className="border-r border-white/10 px-2 py-3 text-center">
                      {col.title}
                    </div>
                  ))}
                  <div className="sticky z-30 border-l border-white/15 px-2 py-3 text-center" style={{ right: `${COL_WIDTHS.deadline}px` }}>
                    ПРОГНОЗ ДАТА
                  </div>
                  <div className="sticky right-0 z-30 border-l border-white/15 px-2 py-3 text-center">
                    ДАТА СДАЧИ
                  </div>
                </div>

                {data.orders.map((orderRow) => (
                  <BoardRow
                    key={orderRow.id}
                    orderRow={orderRow}
                    viewMode={viewMode}
                    onOpenOrder={onOpenOrder}
                    onOpenStage={onOpenStage}
                    orderProgress={progressByOrderId.get(Number(orderRow.id))}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-sm">
            <div className="text-slate-400">
              Страница {pagination.page} из {pagination.totalPages} • Всего: {pagination.total}
            </div>
            <div className="flex items-center gap-2">
              <NeonButton
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                variant="secondary"
                className="rounded-md px-3 py-1"
              >
                Назад
              </NeonButton>
              <NeonButton
                onClick={() => setPage((p) => Math.min(pagination.totalPages || 1, p + 1))}
                disabled={pagination.page >= (pagination.totalPages || 1)}
                variant="secondary"
                className="rounded-md px-3 py-1"
              >
                Вперёд
              </NeonButton>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
