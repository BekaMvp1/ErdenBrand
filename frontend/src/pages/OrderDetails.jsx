/**
 * Детали заказа
 * Редактирование заказа, факта по операциям, завершение, удаление
 * Редактирование вариантов (цвет×размер×количество) как при создании
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import { usePrintHeader } from '../context/PrintContext';
import { CompleteByFactModal, buildBatchPivot, buildTotalsPivot } from './Cutting';
import ProcurementViewModal from '../components/procurement/ProcurementViewModal';
import ProcurementPlanModal from '../components/procurement/ProcurementPlanModal';
import { useGridNavigation } from '../hooks/useGridNavigation';
import { numInputValue } from '../utils/numInput';
import SizeGrid, { SIZE_GRID_MAP, sizeGridNumericFromSelection } from '../components/SizeGrid';

const LETTER_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
const NUMERIC_SIZES = ['38', '40', '42', '44', '46', '48', '50', '52', '54', '56'];
const DEFAULT_SIZES = [...LETTER_SIZES, ...NUMERIC_SIZES];

const GRID_NUM_SET = new Set(SIZE_GRID_MAP.map((r) => r.num));

function sortSizesForDisplay(a, b) {
  const sa = String(a).trim();
  const sb = String(b).trim();
  const na = parseInt(sa, 10);
  const nb = parseInt(sb, 10);
  if (!Number.isNaN(na) && String(na) === sa && !Number.isNaN(nb) && String(nb) === sb) {
    return na - nb;
  }
  return sa.localeCompare(sb, 'ru');
}

function buildSizeGridQuantitiesEdit(selectedSizes, colorList, matrix) {
  const o = {};
  for (const size of selectedSizes) {
    const n = parseInt(size, 10);
    if (String(n) !== String(size).trim() || !GRID_NUM_SET.has(n)) continue;
    let sum = 0;
    (colorList || []).forEach((color) => {
      sum += parseInt(matrix[`${color}|${size}`], 10) || 0;
    });
    o[n] = sum;
  }
  return o;
}

const STATUS_COLORS = {
  Принят: 'bg-gray-500/20 text-gray-900 dark:text-gray-100',
  'В работе': 'bg-lime-500/20 text-lime-400',
  Готов: 'bg-green-500/20 text-green-400',
  Просрочен: 'bg-red-500/20 text-red-400',
};

function formatReceiptDisplay(order) {
  const raw = order?.receipt_date || order?.created_at;
  if (!raw) return '—';
  const s = String(raw).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}.${m}.${y}`;
  }
  try {
    return new Date(raw).toLocaleDateString('ru-RU');
  } catch {
    return '—';
  }
}

/** Проверка: может ли пользователь редактировать факт этой операции */
function canEditActual(user, op) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'manager') return true;
  if (user.role === 'technologist') return true; // backend проверит этаж
  if (user.role === 'operator' && user.Sewer && op.sewer_id === user.Sewer.id) return true;
  return false;
}

/** Проверка: может ли пользователь завершить заказ */
function canComplete(user) {
  return user?.role === 'admin' || user?.role === 'manager' || user?.role === 'technologist';
}

/** Проверка: может ли пользователь редактировать заказ (включая Operator — заказы со своими операциями) */
function canEditOrder(user) {
  return user?.role === 'admin' || user?.role === 'manager' || user?.role === 'technologist' || user?.role === 'operator';
}

/** Проверка: может ли пользователь удалить заказ */
function canDeleteOrder(user) {
  return user?.role === 'admin' || user?.role === 'manager';
}

/** Форматирование этажа для отображения */
function formatFloor(floor) {
  if (floor == null) return '—';
  const labels = { 1: '1 (Финиш)', 2: '2 (Пошив)', 3: '3 (Пошив)', 4: '4 (Пошив)' };
  return labels[floor] || `${floor} этаж`;
}

function parseNumSafe(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function flattenMaterialRows(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((r) => ({
      name: String(r?.name || '').trim(),
      unit: String(r?.unit || '').trim(),
      qty_per_unit: r?.qty_per_unit ?? r?.qtyPerUnit ?? r?.qty ?? '',
      qty_total: r?.qty_total ?? r?.qtyTotal ?? r?.total_qty ?? '',
      price_per_unit: r?.price_per_unit ?? r?.pricePerUnit ?? r?.price ?? r?.rateSom ?? '',
      photo: typeof r?.photo === 'string' && r.photo.trim() ? r.photo : null,
    }));
  }
  const groups = Array.isArray(raw?.groups) ? raw.groups : [];
  const out = [];
  groups.forEach((g) => {
    (g?.rows || []).forEach((r) => {
      out.push({
        name: String(r?.name || '').trim(),
        unit: String(r?.unit || '').trim(),
        qty_per_unit: r?.qty_per_unit ?? r?.qtyPerUnit ?? r?.qty ?? '',
        qty_total: r?.qty_total ?? r?.qtyTotal ?? r?.total_qty ?? '',
        price_per_unit: r?.price_per_unit ?? r?.pricePerUnit ?? r?.price ?? r?.rateSom ?? r?.cost ?? '',
        photo: typeof r?.photo === 'string' && r.photo.trim() ? r.photo : null,
      });
    });
  });
  return out;
}

function materialPayloadHasRows(raw) {
  if (!raw) return false;
  if (Array.isArray(raw)) {
    return raw.some((r) => r && String(r.name || r.title || '').trim());
  }
  if (typeof raw === 'object' && Array.isArray(raw.groups)) {
    return raw.groups.some(
      (g) =>
        Array.isArray(g?.rows) && g.rows.some((r) => r && String(r.name || r.title || '').trim())
    );
  }
  return false;
}

function pickFirstMaterialRaw(candidates) {
  for (const c of candidates) {
    if (materialPayloadHasRows(c)) return c;
  }
  return null;
}

function filterNamedMaterialRow(r) {
  const n = String(r?.name ?? '').trim();
  return n.length > 0 && n !== '—' && n !== '--';
}

/** Диагностика: не логируем целиком base64 фото (зависание консоли) */
function safeOrderJsonStringifyForConsole(order) {
  try {
    return JSON.stringify(order, (key, value) => {
      if (key === 'photos' && Array.isArray(value)) {
        return value.map((p) =>
          typeof p === 'string' && p.length > 400 ? `[photo ${p.length} chars]` : p
        );
      }
      if (typeof value === 'string' && value.length > 800) {
        const ks = String(key);
        if (ks === 'photo' || ks === 'image' || value.startsWith('data:image')) {
          return `[${ks} ${value.length} chars]`;
        }
      }
      return value;
    });
  } catch (e) {
    return `"stringify error: ${e?.message || e}"`;
  }
}

function resolveOrderMaterials(order) {
  const src = order || {};
  const details = src.details && typeof src.details === 'object' ? src.details : {};
  const materials =
    src.materials && typeof src.materials === 'object' && !Array.isArray(src.materials)
      ? src.materials
      : {};

  const fabricRaw = pickFirstMaterialRaw([
    src.fabric_data,
    src.spec_fabric,
    src.order_fabric,
    src.fabric,
    details.fabric_data,
    details.fabric,
    details.materials_fabric,
    details.spec_fabric,
    materials.fabric_data,
    materials.fabric,
    materials.spec_fabric,
  ]);

  const accessoriesRaw = pickFirstMaterialRaw([
    src.fittings_data,
    src.spec_fittings,
    src.order_accessories,
    src.accessories,
    details.fittings_data,
    details.accessories,
    details.spec_fittings,
    details.materials_accessories,
    materials.fittings_data,
    materials.accessories,
    materials.spec_fittings,
  ]);

  return {
    fabric: flattenMaterialRows(fabricRaw).filter(filterNamedMaterialRow),
    accessories: flattenMaterialRows(accessoriesRaw).filter(filterNamedMaterialRow),
  };
}

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingOp, setSavingOp] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [editingActual, setEditingActual] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clients, setClients] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [editForm, setEditForm] = useState({});
  const [editSelectedSizes, setEditSelectedSizes] = useState([]);
  const [editColors, setEditColors] = useState([]);
  const [editMatrix, setEditMatrix] = useState({});
  const [editNewSizeInput, setEditNewSizeInput] = useState('');
  const [editNewColorInput, setEditNewColorInput] = useState('');
  const [editColorSuggestions, setEditColorSuggestions] = useState([]);
  const [editColorDropdownOpen, setEditColorDropdownOpen] = useState(false);
  const [editEditingRowTotal, setEditEditingRowTotal] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [cuttingCompleteModalTask, setCuttingCompleteModalTask] = useState(null);
  const [expandedCuttingTaskIds, setExpandedCuttingTaskIds] = useState(() => new Set());
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentPhotos, setNewCommentPhotos] = useState([]);
  const [addingComment, setAddingComment] = useState(false);
  const [showProcurementModal, setShowProcurementModal] = useState(false);
  const [showProcurementPlanModal, setShowProcurementPlanModal] = useState(false);
  const [procurement, setProcurement] = useState(null);
  const [productionStages, setProductionStages] = useState(null);
  const [stagesLoading, setStagesLoading] = useState(false);
  const editColorInputRef = useRef(null);
  const editColorDropdownRef = useRef(null);

  /** Может ли пользователь редактировать задачи раскроя */
  const canEditCutting = ['admin', 'manager', 'technologist'].includes(user?.role);
  const orderMaterials = useMemo(() => resolveOrderMaterials(order), [order]);
  const orderMaterialsRowsCount = (orderMaterials.fabric?.length || 0) + (orderMaterials.accessories?.length || 0);
  const orderQty = Number(order?.total_quantity || order?.quantity || 0) || 0;
  const calcLine = (row) => {
    const perUnit = parseNumSafe(row.qty_per_unit);
    const qtyTotalRaw = parseNumSafe(row.qty_total);
    const qtyTotal = qtyTotalRaw > 0 ? qtyTotalRaw : perUnit * orderQty;
    const rate = parseNumSafe(row.price_per_unit);
    const sum = qtyTotal * rate;
    return { qtyTotal, rate, sum };
  };
  const fabricTotal = (orderMaterials.fabric || []).reduce((acc, r) => acc + calcLine(r).sum, 0);
  const accessoriesTotal = (orderMaterials.accessories || []).reduce((acc, r) => acc + calcLine(r).sum, 0);
  const procurementTotal = fabricTotal + accessoriesTotal;

  const toggleCuttingTaskExpand = (taskId) => {
    setExpandedCuttingTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const loadOrder = () => {
    api.orders
      .get(id)
      .then((data) => {
        console.log('ORDER FULL:', safeOrderJsonStringifyForConsole(data));
        setOrder(data);
      })
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrder();
  }, [id]);

  const loadProductionStages = () => {
    if (!order?.id) return;
    setStagesLoading(true);
    api.orders
      .getProductionStages(order.id)
      .then(setProductionStages)
      .catch(() => setProductionStages(null))
      .finally(() => setStagesLoading(false));
  };

  useEffect(() => {
    if (!order?.id) return;
    loadProductionStages();
  }, [order?.id]);

  useEffect(() => {
    if (!order?.id) return;
    let cancelled = false;
    api.orders
      .getProcurement(order.id)
      .then((data) => {
        if (!cancelled) setProcurement(data);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[OrderDetails.jsx]:', err?.message || err);
          setProcurement(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [order?.id]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && id) {
        loadOrder();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [id]);

  useEffect(() => {
    if (showEditModal) {
      let cancelled = false;
      api.references
        .clients()
        .then((data) => {
          if (!cancelled) setClients(data);
        })
        .catch((err) => {
          if (!cancelled) console.error('[OrderDetails.jsx]:', err?.message || err);
        });
      api.workshops
        .list()
        .then((data) => {
          if (!cancelled) setWorkshops(data);
        })
        .catch((err) => {
          if (!cancelled) {
            console.error('[OrderDetails.jsx]:', err?.message || err);
            setWorkshops([]);
          }
        });
      api.references
        .orderStatus()
        .then((data) => {
          if (!cancelled) setStatuses(data);
        })
        .catch((err) => {
          if (!cancelled) console.error('[OrderDetails.jsx]:', err?.message || err);
        });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [showEditModal]);

  useEffect(() => {
    let cancelled = false;
    const term = (editNewColorInput || '').trim();
    if (term.length < 2 || !showEditModal) {
      setEditColorSuggestions([]);
      setEditColorDropdownOpen(false);
      return;
    }
    const t = setTimeout(() => {
      api.references
        .colors(term)
        .then((data) => {
          if (cancelled) return;
          setEditColorSuggestions(data || []);
          setEditColorDropdownOpen((data?.length || 0) > 0);
        })
        .catch((err) => {
          if (!cancelled) {
            console.error('[OrderDetails.jsx]:', err?.message || err);
            setEditColorSuggestions([]);
          }
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [editNewColorInput, showEditModal]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        editColorDropdownRef.current && !editColorDropdownRef.current.contains(e.target) &&
        editColorInputRef.current && !editColorInputRef.current.contains(e.target)
      ) {
        setEditColorDropdownOpen(false);
      }
    };
    if (showEditModal) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEditModal]);

  useEffect(() => {
    if (showEditModal && order) {
      const fallbackTitle = String(order.title || '');
      const splitByDash = fallbackTitle.includes('—')
        ? fallbackTitle.split('—')
        : fallbackTitle.split('-');
      const fallbackTz = String(splitByDash[0] || '').trim();
      const fallbackModel = String(splitByDash.slice(1).join('—') || '').trim();
      setEditForm({
        client_id: order.client_id,
        tz_code: order.tz_code || fallbackTz,
        model_name: order.model_name || fallbackModel,
        total_quantity: String(order.total_quantity ?? order.quantity ?? ''),
        deadline: order.deadline,
        receipt_date: order.receipt_date || '',
        comment: order.comment || '',
        planned_month: order.planned_month || '',
        workshop_id: order.workshop_id ?? '',
        status_id: order.status_id,
        order_height_type: order.order_height_type === 'CUSTOM' ? 'CUSTOM' : 'PRESET',
        order_height_value: order.order_height_value ?? 170,
        model_type: order.model_type || 'regular',
      });
      const variants = order.variants || [];
      const sizes = order.sizes || [];
      const colors = order.colors || [];
      setEditSelectedSizes(sizes.length > 0 ? sizes : []);
      setEditColors(colors.length > 0 ? colors : (order.color ? [order.color] : []));
      const m = {};
      variants.forEach((v) => {
        if (v.color && v.size && (v.quantity || 0) > 0) {
          m[`${v.color}|${v.size}`] = v.quantity;
        }
      });
      setEditMatrix(m);
      setEditNewSizeInput('');
      setEditNewColorInput('');
    }
  }, [showEditModal, order]);

  const handleActualChange = (opId, value) => {
    setEditingActual((prev) => ({ ...prev, [opId]: value }));
  };

  const handleSaveActual = async (op) => {
    const val = editingActual[op.id];
    if (val === undefined) return;
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) {
      setErrorMsg('Факт должен быть числом >= 0');
      return;
    }
    setSavingOp(op.id);
    setErrorMsg('');
    try {
      await api.orders.updateOperationActual(order.id, op.id, num);
      setEditingActual((prev) => {
        const next = { ...prev };
        delete next[op.id];
        return next;
      });
      loadOrder();
      setSuccessMsg('Факт сохранён');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения факта');
    } finally {
      setSavingOp(null);
    }
  };

  const handleComplete = async () => {
    setShowCompleteConfirm(false);
    setCompleting(true);
    setErrorMsg('');
    try {
      const res = await api.orders.complete(id);
      loadOrder();
      setSuccessMsg(
        res.summary?.is_overdue
          ? 'Заказ завершён (с просрочкой по дедлайну)'
          : 'Заказ успешно завершён'
      );
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      const msg = err.message || 'Ошибка завершения';
      if (err.problematic?.length) {
        setErrorMsg(
          `${msg} Операции без факта: ${err.problematic.map((p) => p.operation).join(', ')}`
        );
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setCompleting(false);
    }
  };

  const editGetCell = (color, size) => editMatrix[`${color}|${size}`] || '';
  const editSetCell = (color, size, value) => {
    const key = `${color}|${size}`;
    const v = parseInt(value, 10);
    setEditMatrix((prev) => {
      const next = { ...prev };
      if (isNaN(v) || v <= 0) delete next[key];
      else next[key] = v;
      return next;
    });
  };
  const editAddSize = (name) => {
    const n = String(name || '').trim();
    if (!n || editSelectedSizes.includes(n)) return;
    setEditSelectedSizes((prev) => [...prev, n].sort());
    setEditNewSizeInput('');
  };
  const editRemoveSize = (name) => {
    setEditSelectedSizes((prev) => prev.filter((s) => s !== name));
    setEditMatrix((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.endsWith(`|${name}`)) delete next[k]; });
      return next;
    });
  };
  const editAddColor = (name) => {
    const n = String(name || '').trim();
    if (!n || editColors.includes(n)) return;
    setEditColors((prev) => [...prev, n].sort());
    setEditNewColorInput('');
    setEditColorDropdownOpen(false);
  };
  const editRemoveColor = (name) => {
    setEditColors((prev) => prev.filter((c) => c !== name));
    setEditMatrix((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith(`${name}|`)) delete next[k]; });
      return next;
    });
  };

  const editTotalQty = parseInt(editForm.total_quantity, 10) || 0;
  const editMatrixSum = Object.values(editMatrix).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
  const editVariantsValid = editTotalQty > 0 && editSelectedSizes.length > 0 && editColors.length > 0 && editMatrixSum === editTotalQty;
  const { registerRef: registerEditRef, handleKeyDown: handleEditKeyDown } = useGridNavigation(editColors.length, editSelectedSizes.length);

  /** Распределить итог по строке на размеры (равномерно) */
  const editDistributeRowTotal = (color, totalStr) => {
    const total = parseInt(totalStr, 10) || 0;
    if (total <= 0 || editSelectedSizes.length === 0) return;
    const n = editSelectedSizes.length;
    const base = Math.floor(total / n);
    const remainder = total % n;
    setEditMatrix((prev) => {
      const next = { ...prev };
      editSelectedSizes.forEach((s, i) => {
        const key = `${color}|${s}`;
        next[key] = i < remainder ? base + 1 : base;
      });
      return next;
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editVariantsValid) {
      setErrorMsg('Сумма матрицы цвет×размер должна равняться общему количеству');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const variants = [];
      editColors.forEach((color) => {
        editSelectedSizes.forEach((size) => {
          const q = parseInt(editGetCell(color, size), 10) || 0;
          if (q > 0) variants.push({ color, size, quantity: q });
        });
      });
      const payload = {
        client_id: parseInt(editForm.client_id, 10),
        tz_code: editForm.tz_code?.trim(),
        model_name: editForm.model_name?.trim(),
        title: `${editForm.tz_code?.trim() || ''} — ${editForm.model_name?.trim() || ''}`.trim(),
        total_quantity: editTotalQty,
        deadline: editForm.deadline,
        receipt_date: editForm.receipt_date ? String(editForm.receipt_date).slice(0, 10) : undefined,
        comment: editForm.comment?.trim() || undefined,
        planned_month: editForm.planned_month?.trim() || undefined,
        workshop_id: editForm.workshop_id ? parseInt(editForm.workshop_id, 10) : undefined,
        sizes: editSelectedSizes,
        variants,
        size_grid_numeric: sizeGridNumericFromSelection(editSelectedSizes),
        size_grid_quantities: buildSizeGridQuantitiesEdit(editSelectedSizes, editColors, editMatrix),
        order_height_type: editForm.order_height_type === 'CUSTOM' ? 'CUSTOM' : 'PRESET',
        order_height_value: editForm.order_height_type === 'CUSTOM'
          ? Math.min(220, Math.max(120, parseInt(editForm.order_height_value, 10) || 170))
          : (editForm.order_height_value === 165 ? 165 : 170),
        model_type: editForm.model_type || 'regular',
      };
      if (['admin', 'manager'].includes(user?.role)) {
        payload.status_id = parseInt(editForm.status_id, 10);
      }
      await api.orders.update(id, payload);
      setShowEditModal(false);
      loadOrder();
      setSuccessMsg('Заказ обновлён');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    setDeleting(true);
    setErrorMsg('');
    try {
      await api.orders.delete(id);
      navigate('/');
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка удаления');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setUploadingPhoto(true);
      setErrorMsg('');
      try {
        await api.orders.addPhoto(order.id, reader.result);
        loadOrder();
      } catch (err) {
        setErrorMsg(err.message || 'Ошибка загрузки');
      } finally {
        setUploadingPhoto(false);
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const ops = order?.OrderOperations || [];
  // Заказ можно завершить только когда все операции: статус «Готово» и факт >= план
  const allOpsDone =
    ops.length > 0 &&
    ops.every((o) => (o.status || 'Ожидает') === 'Готово' && (o.actual_quantity ?? 0) >= (o.planned_quantity || 0));
  const notDoneOps = ops.filter(
    (o) => (o.status || 'Ожидает') !== 'Готово' || (o.actual_quantity ?? 0) < (o.planned_quantity || 0)
  );
  const isCompleted = order?.OrderStatus?.name === 'Готов';
  const cuttingTasks = order?.CuttingTasks || [];
  const showOperationsSection = false;
  const tzCode = String(order?.tz_code || '').trim();
  const modelName = String(order?.model_name || '').trim();
  const displayOrderName =
    (tzCode && modelName ? `${tzCode} — ${modelName}` : '') ||
    order?.title ||
    tzCode ||
    modelName ||
    '';
  usePrintHeader(displayOrderName ? `Заказ: ${displayOrderName}` : 'Детали заказа', '');

  const handlePrintChecklist = () => {
    if (!order) return;
    const orderNum =
      order.order_number ||
      order.number ||
      String(order.tz_code || '').trim() ||
      (order.id != null ? String(order.id) : '') ||
      '—';
    const productName =
      order.product_name ||
      order.name ||
      String(order.model_name || '').trim() ||
      '—';
    const qty = Number(order.quantity ?? order.total_quantity ?? 0) || 0;
    const date = new Date().toLocaleDateString('ru-RU');

    const fabrics = orderMaterials.fabric || [];
    const accessories = orderMaterials.accessories || [];

    const escHtml = (v) =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const rowItogo = (item) => {
      const perUnit = parseNumSafe(item.qty_per_unit);
      const qtyTotalRaw = parseNumSafe(item.qty_total);
      if (qtyTotalRaw > 0) return qtyTotalRaw;
      if (perUnit > 0 && qty > 0) return perUnit * qty;
      return null;
    };

    const renderRows = (list, startNum = 1) =>
      list
        .map((item, idx) => {
          const itogo = rowItogo(item);
          const itogoStr =
            itogo != null && Number.isFinite(itogo)
              ? Number.isInteger(itogo)
                ? String(itogo)
                : String(itogo.toFixed(4).replace(/\.?0+$/, ''))
              : '—';
          const qtyPer =
            item.qty_per_unit != null && String(item.qty_per_unit).trim() !== ''
              ? escHtml(item.qty_per_unit)
              : escHtml(item.qtyPerUnit ?? '—');
          return `
    <tr>
      <td style="padding:6px;border-bottom:1px solid #ddd">${startNum + idx}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd">
        ${escHtml(item.name || item.material_name || '—')}
      </td>
      <td style="padding:6px;border-bottom:1px solid #ddd;text-align:center">
        ${
          item.photo || item.image
            ? `<img src="${escHtml(item.photo || item.image)}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:4px"/>`
            : '—'
        }
      </td>
      <td style="padding:6px;border-bottom:1px solid #ddd">${escHtml(item.unit || '—')}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd">${qtyPer}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd">${itogoStr}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd"></td>
      <td style="padding:6px;border-bottom:1px solid #ddd"></td>
      <td style="padding:6px;border-bottom:1px solid #ddd"></td>
    </tr>`;
        })
        .join('');

    const groupHeader = (title) => `
    <tr>
      <td colspan="9"
        style="background:#1a237e;color:#fff;font-weight:bold;padding:6px 8px;font-size:12px">
        ${escHtml(title)}
      </td>
    </tr>`;

    const accStart = fabrics.length > 0 ? fabrics.length + 1 : 1;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Чек-лист закупа — ${escHtml(orderNum)}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box }
    body { font-family:Arial,sans-serif; font-size:12px; color:#000; padding:20px }
    h2 { font-size:16px; font-weight:bold; margin-bottom:8px }
    .info { display:flex; gap:30px; margin-bottom:14px; flex-wrap:wrap }
    table { width:100%; border-collapse:collapse; margin-bottom:16px }
    th { background:#1a237e; color:#fff; padding:7px 6px; text-align:left; font-size:11px }
    tr:nth-child(even) td { background:#f9f9f9 }
    .sig { margin-top:36px; display:flex; gap:60px }
    .sig-line { border-top:1px solid #000; width:200px; margin-top:40px;
                font-size:11px; padding-top:4px }
    .footer { margin-top:16px; font-size:10px; color:#888 }
    @media print { body { padding:10px } }
  </style>
</head>
<body>
  <h2>ЧЕК-ЛИСТ ЗАКУПА МАТЕРИАЛОВ</h2>
  <div class="info">
    <span><b>Заказ:</b> ${escHtml(orderNum)}</span>
    <span><b>Изделие:</b> ${escHtml(productName)}</span>
    <span><b>Кол-во:</b> ${qty} шт</span>
    <span><b>Дата:</b> ${escHtml(date)}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:28px">№</th>
        <th style="width:150px">Наименование</th>
        <th style="width:58px">Фото</th>
        <th style="width:55px">Ед.изм</th>
        <th style="width:80px">Кол-во на ед.</th>
        <th style="width:75px">Итого</th>
        <th style="width:75px">Цена</th>
        <th style="width:100px">Поставщик</th>
        <th style="width:75px">Сумма</th>
      </tr>
    </thead>
    <tbody>
      ${fabrics.length > 0 ? groupHeader('ТКАНЬ') + renderRows(fabrics, 1) : ''}
      ${accessories.length > 0 ? groupHeader('ФУРНИТУРА') + renderRows(accessories, accStart) : ''}
    </tbody>
  </table>
  <div class="sig">
    <div><div class="sig-line">Закупщик: ________________</div></div>
    <div><div class="sig-line">Кладовщик: ________________</div></div>
    <div><div class="sig-line">Руководитель: ________________</div></div>
  </div>
  <div class="footer">Сформировано: ${escHtml(date)} | ErdenBrand</div>
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:0';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 300);
  };

  const handleCuttingStatusChange = async (task, newStatus) => {
    try {
      await api.cutting.updateTask(task.id, { status: newStatus });
      loadOrder();
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка обновления статуса');
    }
  };

  const handleCuttingCompleteByFact = async (task, actualVariants, endDate) => {
    try {
      await api.cutting.updateTask(task.id, {
        status: 'Готово',
        actual_variants: actualVariants,
        end_date: endDate || undefined,
      });
      setCuttingCompleteModalTask(null);
      loadOrder();
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    }
  };

  const handleCuttingEditActualVariants = async (task, actualVariants, endDate) => {
    try {
      await api.cutting.updateTask(task.id, {
        actual_variants: actualVariants,
        end_date: endDate || undefined,
      });
      setCuttingCompleteModalTask(null);
      loadOrder();
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    }
  };

  const handleAddComment = async (e) => {
    e?.preventDefault?.();
    if (!order?.id) return;
    if (!(newCommentText || '').trim() && newCommentPhotos.length === 0) {
      setErrorMsg('Введите текст или прикрепите фото');
      return;
    }
    setAddingComment(true);
    setErrorMsg('');
    try {
      await api.orders.addComment(order.id, {
        text: (newCommentText || '').trim() || undefined,
        photos: newCommentPhotos.length > 0 ? newCommentPhotos : undefined,
      });
      setNewCommentText('');
      setNewCommentPhotos([]);
      loadOrder();
      setSuccessMsg('Комментарий добавлен');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка добавления комментария');
    } finally {
      setAddingComment(false);
    }
  };

  const handleCuttingDeleteTask = async (task) => {
    if (!confirm('Удалить задачу на раскрой?')) return;
    try {
      await api.cutting.deleteTask(task.id);
      loadOrder();
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка удаления');
    }
  };

  if (loading) return <div className="text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>;
  if (!order) return <div className="text-red-500 dark:text-red-400">Заказ не найден</div>;

  return (
    <div className="pt-2 sm:pt-4 min-w-0 overflow-x-hidden">
      <div className="no-print flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#ECECEC] dark:text-dark-text truncate min-w-0">
          {displayOrderName}
        </h1>
        <div className="flex gap-2 flex-wrap">
          <PrintButton />
          <button
            type="button"
            onClick={handlePrintChecklist}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
          >
            🖨️ Чек-лист закупа
          </button>
          <button
            type="button"
            onClick={() => setShowProcurementModal(true)}
            className="px-4 py-2 rounded-lg bg-accent-1/40 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/50 dark:hover:bg-dark-3 font-medium flex items-center gap-2"
            title="Открыть закуп"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Открыть закуп
          </button>
          {canEditOrder(user) && (
            <button
              onClick={() => setShowEditModal(true)}
              className="px-4 py-2 rounded-lg bg-accent-1/40 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/50 dark:hover:bg-dark-3 font-medium flex items-center gap-2"
              title="Редактировать заказ"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Редактировать
            </button>
          )}
          {canDeleteOrder(user) && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-red-500/30 text-red-400 hover:bg-red-500/40 font-medium disabled:opacity-50"
            >
              {deleting ? 'Удаление...' : 'Удалить'}
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="no-print mb-4 p-4 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="no-print mb-4 p-4 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
          {errorMsg}
        </div>
      )}

      <div className="print-area mb-4 sm:mb-6 flex flex-col gap-4 sm:gap-6">
        <h1 className="print-title print-only">
          {order.Client?.name || '—'} — {displayOrderName}
        </h1>
        <div className="card-neon rounded-card overflow-hidden transition-block">
          <h2 className="text-base sm:text-lg font-medium text-[#ECECEC] dark:text-dark-text p-4 sm:p-6 border-b border-white/25 dark:border-white/25">
            Информация о заказе
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(140px,1fr)_2fr] gap-0 md:gap-6">
            {/* Меньше половины — фото */}
            <div className="relative p-4 sm:p-6 border-b md:border-b-0 md:border-r border-white/25 dark:border-white/25 flex flex-col items-center justify-center min-h-[200px]">
              {canEditOrder(user) && (order.photos?.length || 0) < 10 && (
                <label
                  className="absolute top-3 right-3 w-8 h-8 rounded-lg border border-white/25 bg-accent-2/60 hover:bg-accent-2/80 text-[#ECECEC] flex items-center justify-center cursor-pointer transition-colors"
                  title="Добавить фото"
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingPhoto}
                    onChange={handleAddPhoto}
                  />
                  {uploadingPhoto ? '…' : '+'}
                </label>
              )}
              {(order.photos || []).length > 0 ? (
                <div className="w-full flex flex-wrap gap-3 justify-center pt-8">
                  {(order.photos || []).map((photo, idx) => (
                    <div key={idx} className="relative group">
                      <div className="w-64 h-64 md:w-80 md:h-80 rounded-xl border-2 border-white/30 dark:border-white/30 bg-black/20 overflow-hidden">
                        <img
                          src={photo}
                          alt={`Фото ${idx + 1}`}
                          className="w-full h-full object-contain p-1 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setViewingPhoto(photo)}
                        />
                      </div>
                      {canEditOrder(user) && (
                        <button
                          type="button"
                          onClick={async (ev) => {
                            ev.stopPropagation();
                            try {
                              await api.orders.deletePhoto(order.id, idx);
                              loadOrder();
                            } catch (e) {
                              setErrorMsg(e.message);
                            }
                          }}
                          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-sm hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="w-full h-72 md:h-96 rounded-xl border-2 border-white/30 dark:border-white/30 bg-black/20 flex flex-col items-center justify-center text-[#ECECEC]/50">
                    {canEditOrder(user) ? (
                      <>
                        <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm text-[#ECECEC]/70">
                          {uploadingPhoto ? 'Загрузка...' : 'Нажмите + в углу для добавления фото'}
                        </span>
                      </>
                    ) : (
                      <>
                      <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm">Нет фото</span>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            {/* Больше половины — информация, цвет, размер и т.д. */}
            <div className="p-4 sm:p-6 space-y-4">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-white/15 dark:border-white/15">
                    <td className="px-0 sm:px-4 py-2 sm:py-3 w-36 sm:w-48 text-[#ECECEC]/80 dark:text-dark-text/80">Клиент</td>
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text">{order.Client?.name}</td>
                  </tr>
                  <tr className="border-b border-white/15 dark:border-white/15">
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Общее количество</td>
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text">
                      {order.total_quantity ?? order.quantity}
                    </td>
                  </tr>
                  <tr className="border-b border-white/15 dark:border-white/15">
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Дата поступления заказа</td>
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text whitespace-nowrap">{formatReceiptDisplay(order)}</td>
                  </tr>
                  <tr className="border-b border-white/15 dark:border-white/15">
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Дедлайн</td>
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text whitespace-nowrap">{order.deadline}</td>
                  </tr>
                  <tr className="border-b border-white/15 dark:border-white/15">
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Статус</td>
                    <td className="px-0 sm:px-4 py-2 sm:py-3">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          STATUS_COLORS[order.OrderStatus?.name] || 'bg-gray-500/20'
                        }`}
                      >
                        {order.OrderStatus?.name}
                      </span>
                    </td>
                  </tr>
                  {order.completed_at && (
                    <tr className="border-b border-white/15 dark:border-white/15">
                      <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Завершён</td>
                      <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text whitespace-nowrap">
                        {new Date(order.completed_at).toLocaleString('ru-RU')}
                      </td>
                    </tr>
                  )}
                  <tr className="border-b border-white/15 dark:border-white/15">
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Цех пошива</td>
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text">{order.Workshop?.name || order.Floor?.name || '—'}</td>
                  </tr>
                  <tr className="border-b border-white/15 dark:border-white/15">
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC]/80 dark:text-dark-text/80">Рост</td>
                    <td className="px-0 sm:px-4 py-2 sm:py-3 text-[#ECECEC] dark:text-dark-text">
                      {order.order_height_value != null ? `Рост: ${order.order_height_value}` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
              {/* Цвета и размеры */}
              {(() => {
                const variants = order.variants || [];
                const sizes = order.sizes || [];
                const colors = order.colors || [];
                const totalQty = order.total_quantity ?? order.quantity ?? 0;
                const getQty = (c, s) =>
                  variants.find((v) => v.color === c && v.size === s)?.quantity ?? 0;
                if (variants.length === 0 && !order.color) {
                  return (
                    <p className="text-[#ECECEC]/80 dark:text-dark-text/80 text-sm">Варианты не указаны</p>
                  );
                }
                if (variants.length === 0) {
                  return (
                    <p className="text-[#ECECEC]/80 dark:text-dark-text/80 text-sm">
                      Цвет: {order.color || '—'}, количество: {totalQty}
                    </p>
                  );
                }
                return (
                  <div className="overflow-x-auto">
                    <p className="text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 mb-2">Цвета и размеры</p>
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-white/20 dark:border-white/20">
                          <th className="text-left px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text/90 border-b border-r border-white/15 dark:border-white/15">
                            Цвет
                          </th>
                          {sizes.map((s) => (
                            <th
                              key={s}
                              className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text/90 border-b border-white/15 dark:border-white/15 text-center"
                            >
                              {s}
                            </th>
                          ))}
                          <th className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text/90 border-b border-white/15 dark:border-white/15 text-center">
                            Итого
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {colors.map((color) => {
                          const rowSum = sizes.reduce((a, s) => a + getQty(color, s), 0);
                          return (
                            <tr key={color} className="border-b border-white/15 dark:border-white/15">
                              <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text border-b border-r border-white/15 dark:border-white/15">
                                {color}
                              </td>
                              {sizes.map((size) => (
                                <td
                                  key={size}
                                  className="px-3 py-2 text-[#ECECEC]/90 dark:text-dark-text/80 border-b border-white/15 dark:border-white/15 text-center"
                                >
                                  {getQty(color, size) || '—'}
                                </td>
                              ))}
                              <td className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text border-b border-white/15 dark:border-white/15 text-center">
                                {rowSum}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-b border-white/20 dark:border-white/20">
                          <td className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text border-r border-white/15 dark:border-white/15">
                            Итого
                          </td>
                          {sizes.map((size) => {
                            const colSum = colors.reduce((a, c) => a + getQty(c, size), 0);
                            return (
                              <td
                                key={size}
                                className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text text-center"
                              >
                                {colSum}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 font-bold text-[#ECECEC] dark:text-dark-text text-center">
                            {totalQty}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })()}

            </div>
          </div>

          {/* Комментарии с фото */}
          <div className="p-4 sm:p-6 border-t border-white/25 dark:border-white/25">
            <h3 className="text-sm font-semibold text-[#ECECEC] dark:text-dark-text mb-3">Комментарии и фото для производства</h3>
            {(order.order_comments || []).length > 0 ? (
              <div className="space-y-4 mb-4">
                {order.order_comments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-white/20 dark:border-white/20 p-3 bg-accent-2/20 dark:bg-dark-800/50">
                    {c.text && <p className="text-sm text-[#ECECEC] dark:text-dark-text whitespace-pre-wrap mb-2">{c.text}</p>}
                    <div className="flex items-center gap-2 text-xs text-[#ECECEC]/70 dark:text-dark-text/70 mb-2">
                      {c.created_at && (
                        <span>{new Date(c.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      )}
                      {c.author?.name && <span>— {c.author.name}</span>}
                    </div>
                    {c.photos?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {c.photos.map((photo, idx) => (
                          <img
                            key={idx}
                            src={photo}
                            alt={`Фото ${idx + 1}`}
                            className="w-[180px] h-[120px] object-cover rounded-lg border border-white/20 cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setViewingPhoto(photo)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#ECECEC]/60 dark:text-dark-text/60 mb-4">Нет комментариев</p>
            )}
            {canEditOrder(user) && (
              <form onSubmit={handleAddComment} className="space-y-2">
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Текст комментария (опционально)"
                  className="w-full px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
                  rows={2}
                />
                <div className="flex flex-wrap gap-2 items-center">
                  {newCommentPhotos.map((photo, idx) => (
                    <div key={idx} className="relative group">
                      <img src={photo} alt={`Фото ${idx + 1}`} className="w-16 h-16 object-cover rounded-lg border border-white/25" />
                      <button
                        type="button"
                        onClick={() => setNewCommentPhotos((p) => p.filter((_, i) => i !== idx))}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs hover:bg-red-600 flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {newCommentPhotos.length < 10 && (
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-dashed border-white/30 hover:border-primary-500 cursor-pointer transition-colors text-sm text-[#ECECEC]/80">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => setNewCommentPhotos((p) => [...p, reader.result].slice(0, 10));
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Добавить фото
                    </label>
                  )}
                  <button
                    type="submit"
                    disabled={addingComment || (!(newCommentText || '').trim() && newCommentPhotos.length === 0)}
                    className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addingComment ? 'Сохранение...' : 'Отправить'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

      {/* 1. Закуп */}
      <div className="card-neon rounded-card overflow-hidden mt-4 sm:mt-6 transition-block">
        <div className="p-4 sm:p-6 border-b border-white/25 dark:border-white/25 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-medium text-[#ECECEC] dark:text-dark-text">Закуп</h2>
            <div className="flex flex-wrap gap-2">
              {canEditCutting && procurement?.procurement?.status !== 'received' && (
                <button
                  type="button"
                  onClick={() => setShowProcurementPlanModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-accent-2/50 text-[#ECECEC] text-sm hover:bg-accent-2/70"
                >
                  {procurement?.procurement?.id ? 'Редактировать план' : 'План закупа'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowProcurementModal(true)}
                className="px-3 py-1.5 rounded-lg bg-accent-1/30 text-[#ECECEC] text-sm"
              >
                Открыть закуп
              </button>
            </div>
          </div>
          <div className="p-4 sm:p-6 space-y-4">
            <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="text-[#ECECEC]/70 dark:text-dark-text/70">Статус</span>
              <span
                className={`font-medium px-2 py-0.5 rounded text-xs ${
                  procurement?.procurement?.status === 'received'
                    ? 'bg-green-500/20 text-green-400'
                    : procurement?.procurement?.status === 'sent'
                      ? 'bg-lime-500/20 text-lime-400'
                      : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {procurement?.procurement?.status === 'received'
                  ? 'Закуплено'
                  : procurement?.procurement?.status === 'sent'
                    ? 'Отправлено'
                    : '—'}
              </span>
              <span className="text-[#ECECEC]/70 dark:text-dark-text/70 ml-2">Дедлайн</span>
              <span className="font-medium text-[#ECECEC] dark:text-dark-text">{procurement?.procurement?.due_date || '—'}</span>
              <span className="text-[#ECECEC]/70 dark:text-dark-text/70 ml-2">Сумма</span>
              <span className="font-medium text-primary-400">{Number(procurement?.procurement?.total_sum || 0).toFixed(2)} ₽</span>
              <span className="text-[#ECECEC]/70 dark:text-dark-text/70 ml-2">Обновлено</span>
              <span className="font-medium text-[#ECECEC] dark:text-dark-text">
                {procurement?.procurement?.updated_at
                  ? procurement.procurement.updated_at.slice(0, 10).split('-').reverse().join('.')
                  : '—'}
              </span>
              {procurement?.procurement?.completed_at && (
                <>
                  <span className="text-[#ECECEC]/70 dark:text-dark-text/70 ml-2">Выполнено</span>
                  <span className="font-medium text-green-400">✅ {new Date(procurement.procurement.completed_at).toLocaleString('ru-RU')}</span>
                </>
              )}
            </div>
            {orderMaterialsRowsCount === 0 ? (
              <p className="text-[#ECECEC]/70 dark:text-dark-text/70 text-sm">Материалы не указаны</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-white/20 dark:border-white/20">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25">
                      <th className="text-left px-3 py-2 text-[#ECECEC]/90 dark:text-dark-text/90">№</th>
                      <th className="text-left px-3 py-2 text-[#ECECEC]/90 dark:text-dark-text/90">Наименование</th>
                      <th className="text-left px-3 py-2 text-[#ECECEC]/90 dark:text-dark-text/90">Фото</th>
                      <th className="text-left px-3 py-2 text-[#ECECEC]/90 dark:text-dark-text/90">Ед.изм</th>
                      <th className="text-left px-3 py-2 text-[#ECECEC]/90 dark:text-dark-text/90">Кол-во итого</th>
                      <th className="text-left px-3 py-2 text-[#ECECEC]/90 dark:text-dark-text/90">Расценка</th>
                      <th className="text-left px-3 py-2 text-[#ECECEC]/90 dark:text-dark-text/90">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-[#1e3a5f]/50 border-b border-white/20">
                      <td colSpan={7} className="px-3 py-2 font-semibold text-[#ECECEC]">ТКАНЬ</td>
                    </tr>
                    {(orderMaterials.fabric || []).map((row, idx) => {
                      const line = calcLine(row);
                      return (
                        <tr key={`fab-${idx}`} className="border-b border-white/10">
                          <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">{idx + 1}</td>
                          <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">{row.name || '—'}</td>
                          <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">
                            {row.photo ? (
                              <img
                                src={row.photo}
                                alt=""
                                onClick={() => setViewingPhoto(row.photo)}
                                className="w-10 h-10 object-cover rounded border border-white/20 cursor-pointer"
                              />
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">{row.unit || '—'}</td>
                          <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">{line.qtyTotal ? line.qtyTotal : '—'}</td>
                          <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">{line.rate ? `${line.rate} сом` : '—'}</td>
                          <td className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text">{line.sum ? `${line.sum.toFixed(2)} сом` : '—'}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-[#1e3a5f]/50 border-b border-white/20">
                      <td colSpan={7} className="px-3 py-2 font-semibold text-[#ECECEC]">ФУРНИТУРА</td>
                    </tr>
                    {(orderMaterials.accessories || []).map((row, idx) => {
                      const line = calcLine(row);
                      return (
                        <tr key={`acc-${idx}`} className="border-b border-white/10">
                          <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">{idx + 1}</td>
                          <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">{row.name || '—'}</td>
                          <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">
                            {row.photo ? (
                              <img
                                src={row.photo}
                                alt=""
                                onClick={() => setViewingPhoto(row.photo)}
                                className="w-10 h-10 object-cover rounded border border-white/20 cursor-pointer"
                              />
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">{row.unit || '—'}</td>
                          <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">{line.qtyTotal ? line.qtyTotal : '—'}</td>
                          <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">{line.rate ? `${line.rate} сом` : '—'}</td>
                          <td className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text">{line.sum ? `${line.sum.toFixed(2)} сом` : '—'}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-accent-2/40 border-t border-white/20">
                      <td colSpan={6} className="px-3 py-2 text-right font-medium text-[#ECECEC]/90">Итого ткань:</td>
                      <td className="px-3 py-2 font-semibold text-[#ECECEC]">{fabricTotal.toFixed(2)} сом</td>
                    </tr>
                    <tr className="bg-accent-2/40 border-t border-white/20">
                      <td colSpan={6} className="px-3 py-2 text-right font-medium text-[#ECECEC]/90">Итого фурнитура:</td>
                      <td className="px-3 py-2 font-semibold text-[#ECECEC]">{accessoriesTotal.toFixed(2)} сом</td>
                    </tr>
                    <tr className="bg-primary-600/20 border-t border-white/20">
                      <td colSpan={6} className="px-3 py-2 text-right font-semibold text-primary-300">ИТОГО ЗАКУП:</td>
                      <td className="px-3 py-2 font-bold text-primary-300">{procurementTotal.toFixed(2)} сом</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            </>
          </div>
        </div>

      {/* 2. Планирование */}
      <div className="card-neon rounded-card overflow-hidden mt-4 sm:mt-6 transition-block">
        <div className="p-4 sm:p-6 border-b border-white/25 dark:border-white/25 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-medium text-[#ECECEC] dark:text-dark-text">Планирование</h2>
          {order?.workshop_id && (
            <Link
              to={`/planning?order_id=${order.id}${order.workshop_id ? `&workshop_id=${order.workshop_id}` : ''}`}
              className="text-sm px-3 py-1.5 rounded-lg bg-primary-600/80 text-white hover:bg-primary-600"
            >
              Открыть в Планировании
            </Link>
          )}
        </div>
        <div className="p-4 sm:p-6">
          {stagesLoading ? (
            <p className="text-[#ECECEC]/70 dark:text-dark-text/70 text-sm">Загрузка...</p>
          ) : !(productionStages?.planning || []).length ? (
            <p className="text-[#ECECEC]/70 dark:text-dark-text/70 text-sm">Нет данных</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[280px] text-sm">
                <thead>
                  <tr className="bg-accent-2/80 dark:bg-dark-800 border-b border-white/25">
                    <th className="text-left px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Дата</th>
                    <th className="text-right px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">План</th>
                    <th className="text-right px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Факт</th>
                  </tr>
                </thead>
                <tbody>
                  {(productionStages.planning || []).map((row) => (
                    <tr key={row.date} className="border-b border-white/10 dark:border-white/10">
                      <td className="px-4 py-2 text-[#ECECEC] dark:text-dark-text">{row.date}</td>
                      <td className="px-4 py-2 text-right text-[#ECECEC]/90 dark:text-dark-text/80">{row.planned_qty ?? 0}</td>
                      <td className="px-4 py-2 text-right text-[#ECECEC]/90 dark:text-dark-text/80">{row.actual_qty ?? 0}</td>
                    </tr>
                  ))}
                  <tr className="bg-accent-2/50 dark:bg-dark-800 border-t-2 border-white/25 font-medium">
                    <td className="px-4 py-3 text-[#ECECEC] dark:text-dark-text">Итого</td>
                    <td className="px-4 py-3 text-right text-[#ECECEC] dark:text-dark-text">
                      {(productionStages.planning || []).reduce((s, r) => s + (r.planned_qty ?? 0), 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-[#ECECEC] dark:text-dark-text">
                      {(productionStages.planning || []).reduce((s, r) => s + (r.actual_qty ?? 0), 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 3. Раскрой */}
      <div className="card-neon rounded-card overflow-hidden mt-4 sm:mt-6 transition-block">
          <div className="p-4 sm:p-6 border-b border-white/25 dark:border-white/25">
            <h2 className="text-base sm:text-lg font-medium text-[#ECECEC] dark:text-dark-text">
              Раскрой
            </h2>
            {cuttingTasks.length > 0 && (
              <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mt-1">
                Цех: {[...new Set(cuttingTasks.map((t) => t.cutting_type).filter(Boolean))].join(', ') || '—'}
              </p>
            )}
          </div>
          {cuttingTasks.length === 0 ? (
            <div className="p-4 sm:p-6">
              <p className="text-[#ECECEC]/70 dark:text-dark-text/70 text-sm">Нет данных</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25 dark:border-white/25">
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Заказ</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Этаж</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Дата начала</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Дата окончания</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Операция</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Ответственный</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">По факту</th>
                  {canEditCutting && (
                    <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Действия</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {cuttingTasks.map((task) => {
                  const actualVariants = task.status === 'Готово' ? (task.actual_variants || []) : [];
                  const batchPivot = buildBatchPivot(actualVariants);
                  const totalQty = batchPivot.rows.reduce((s, r) => {
                    s += Object.values(r.bySize).reduce((a, b) => a + b, 0);
                    return s;
                  }, 0);
                  const planTotal = (order.OrderVariants || []).reduce((s, v) => s + (v.quantity || 0), 0);
                  const isExpanded = expandedCuttingTaskIds.has(task.id);
                  return (
                    <React.Fragment key={task.id}>
                      <tr className="border-b border-white/10 dark:border-white/10">
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleCuttingTaskExpand(task.id)}
                              className="p-1 rounded hover:bg-accent-2/50 dark:hover:bg-dark-800 text-[#ECECEC]/80 dark:text-dark-text/80 transition-transform duration-200"
                              title={isExpanded ? 'Свернуть' : 'Развернуть детали'}
                            >
                              <svg
                                className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <div>
                              <span className="text-primary-400 font-medium">#{order.id}</span>
                              <div className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80">{order.Client?.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{formatFloor(task.floor)}</td>
                        <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{task.start_date || '—'}</td>
                        <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{task.end_date || '—'}</td>
                        <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{task.operation || 'раскрой'}</td>
                        <td className="px-4 py-3 align-top">
                          {canEditCutting ? (
                            <select
                              value={task.status}
                              onChange={(e) => handleCuttingStatusChange(task, e.target.value)}
                              className="px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
                            >
                              <option value="Ожидает">Ожидает</option>
                              <option value="В работе">В работе</option>
                              <option value="Готово">Готово</option>
                            </select>
                          ) : (
                            <span>{task.status}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{task.responsible || '—'}</td>
                        <td className="px-4 py-3 align-top">
                          {(batchPivot.rows.length > 0 || planTotal > 0) && (
                            isExpanded && canEditCutting ? (
                              <button
                                onClick={() => setCuttingCompleteModalTask(task)}
                                className="min-w-[200px] px-2.5 py-1 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                              >
                                {task.status === 'Готово' ? 'Редактировать по факту' : 'Завершить по факту'}
                              </button>
                            ) : !isExpanded ? (
                              <div className="text-sm text-[#ECECEC]/90 dark:text-dark-text/90 flex flex-col gap-0.5">
                                <div className="flex items-baseline gap-2">
                                  <span className="shrink-0 w-10">План:</span>
                                  <span className="tabular-nums">{planTotal}</span>
                                </div>
                                {task.status === 'Готово' && (
                                  <div className="flex items-baseline gap-2">
                                    <span className="shrink-0 w-10">Факт:</span>
                                    <span className="tabular-nums">{totalQty}</span>
                                  </div>
                                )}
                              </div>
                            ) : !canEditCutting && task.status === 'Готово' ? (
                              <span className="text-[#ECECEC]/80">—</span>
                            ) : null
                          )}
                        </td>
                        {canEditCutting && (
                          <td className="px-4 py-3 align-top">
                            <button
                              onClick={() => handleCuttingDeleteTask(task)}
                              className="text-red-500 hover:text-red-400 text-sm"
                            >
                              Удалить
                            </button>
                          </td>
                        )}
                      </tr>
                      <tr className="border-b border-white/15 dark:border-white/15 bg-accent-2/20 dark:bg-dark-900/50">
                        <td colSpan={canEditCutting ? 9 : 8} className="px-4 py-0 overflow-hidden">
                          <div
                            className="grid transition-[grid-template-rows] duration-300 ease-out"
                            style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
                          >
                            <div className="min-h-0 overflow-hidden">
                              <div className="px-4 py-2">
                                <p className="text-xs text-[#ECECEC]/60 dark:text-dark-text/60 mb-1">Итог по цветам</p>
                                <table className="w-full text-sm border border-white/15 dark:border-white/15 rounded overflow-hidden max-w-[560px]">
                                  <thead>
                                    <tr className="bg-accent-2/50 dark:bg-dark-800">
                                      <th className="text-left px-4 py-1.5 font-medium">Цвет</th>
                                      {batchPivot.sizes.map((s) => (
                                        <th key={s} className="text-center px-2 py-1.5 font-medium">{s}</th>
                                      ))}
                                      <th className="text-right px-4 py-1.5 font-medium">Итого</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {batchPivot.rows.length === 0 ? (
                                      <tr><td colSpan={batchPivot.sizes.length + 2} className="px-4 py-1.5 text-[#ECECEC]/60">Нет данных</td></tr>
                                    ) : (
                                      <>
                                        {batchPivot.rows.map((r) => {
                                          const total = Object.values(r.bySize).reduce((a, b) => a + b, 0);
                                          return (
                                            <tr key={r.color} className="border-t border-white/10">
                                              <td className="px-4 py-1">{r.color}</td>
                                              {batchPivot.sizes.map((size) => (
                                                <td key={size} className="px-2 py-1 text-center">{r.bySize[size] ?? 0}</td>
                                              ))}
                                              <td className="px-4 py-1 text-right font-medium">{total}</td>
                                            </tr>
                                          );
                                        })}
                                        <tr className="border-t-2 border-white/20 bg-accent-2/30 dark:bg-dark-800 font-semibold">
                                          <td className="px-4 py-1.5">Итого по размерам</td>
                                          {batchPivot.sizes.map((s) => {
                                            const colSum = batchPivot.rows.reduce((acc, r) => acc + (r.bySize[s] ?? 0), 0);
                                            return <td key={s} className="px-2 py-1.5 text-center">{colSum}</td>;
                                          })}
                                          <td className="px-4 py-1.5 text-right">
                                            {batchPivot.rows.reduce((acc, r) => acc + Object.values(r.bySize).reduce((a, b) => a + b, 0), 0)}
                                          </td>
                                        </tr>
                                      </>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>

      {/* 4. Пошив */}
      <div className="card-neon rounded-card overflow-hidden mt-4 sm:mt-6 transition-block">
        <div className="p-4 sm:p-6 border-b border-white/25 dark:border-white/25 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-medium text-[#ECECEC] dark:text-dark-text">Пошив</h2>
          <Link to={`/sewing${order?.id ? `?order_id=${order.id}` : ''}`} className="text-sm px-3 py-1.5 rounded-lg bg-primary-600/80 text-white hover:bg-primary-600">
            Открыть пошив
          </Link>
        </div>
        <div className="p-4 sm:p-6">
          {stagesLoading ? (
            <p className="text-[#ECECEC]/70 dark:text-dark-text/70 text-sm">Загрузка...</p>
          ) : !(productionStages?.sewing || []).length ? (
            <p className="text-[#ECECEC]/70 dark:text-dark-text/70 text-sm">Нет данных</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead>
                  <tr className="bg-accent-2/80 dark:bg-dark-800 border-b border-white/25">
                    <th className="text-left px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Партия</th>
                    <th className="text-left px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
                    <th className="text-right px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Кол-во</th>
                    <th className="text-left px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Период</th>
                  </tr>
                </thead>
                <tbody>
                  {(productionStages.sewing || []).map((sb) => (
                    <tr key={sb.id} className="border-b border-white/10 dark:border-white/10">
                      <td className="px-4 py-2 text-[#ECECEC] dark:text-dark-text font-medium">{sb.batch_code || `#${sb.id}`}</td>
                      <td className="px-4 py-2 text-[#ECECEC]/90 dark:text-dark-text/80">{sb.status || '—'}</td>
                      <td className="px-4 py-2 text-right text-[#ECECEC]/90 dark:text-dark-text/80">{sb.qty ?? '—'}</td>
                      <td className="px-4 py-2 text-[#ECECEC]/90 dark:text-dark-text/80">
                        {sb.date_from || sb.date_to ? [sb.date_from, sb.date_to].filter(Boolean).join(' — ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 5. ОТК */}
      <div className="card-neon rounded-card overflow-hidden mt-4 sm:mt-6 transition-block">
        <div className="p-4 sm:p-6 border-b border-white/25 dark:border-white/25 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-medium text-[#ECECEC] dark:text-dark-text">ОТК</h2>
          <Link to="/otk" className="text-sm px-3 py-1.5 rounded-lg bg-primary-600/80 text-white hover:bg-primary-600">
            Открыть ОТК
          </Link>
        </div>
        <div className="p-4 sm:p-6">
          {stagesLoading ? (
            <p className="text-[#ECECEC]/70 dark:text-dark-text/70 text-sm">Загрузка...</p>
          ) : !(productionStages?.qc || []).length ? (
            <p className="text-[#ECECEC]/70 dark:text-dark-text/70 text-sm">Нет данных</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[280px] text-sm">
                <thead>
                  <tr className="bg-accent-2/80 dark:bg-dark-800 border-b border-white/25">
                    <th className="text-left px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Партия</th>
                    <th className="text-left px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {(productionStages.qc || []).map((qb) => (
                    <tr key={qb.id} className="border-b border-white/10 dark:border-white/10">
                      <td className="px-4 py-2 text-[#ECECEC] dark:text-dark-text">#{qb.batch_id ?? qb.id}</td>
                      <td className="px-4 py-2 text-[#ECECEC]/90 dark:text-dark-text/80">{qb.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 6. Склад */}
      <div className="card-neon rounded-card overflow-hidden mt-4 sm:mt-6 transition-block">
        <div className="p-4 sm:p-6 border-b border-white/25 dark:border-white/25">
          <h2 className="text-base sm:text-lg font-medium text-[#ECECEC] dark:text-dark-text">Склад</h2>
        </div>
        <div className="p-4 sm:p-6">
          {stagesLoading ? (
            <p className="text-[#ECECEC]/70 dark:text-dark-text/70 text-sm">Загрузка...</p>
          ) : !(productionStages?.warehouse || []).length ? (
            <p className="text-[#ECECEC]/70 dark:text-dark-text/70 text-sm">Нет данных</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[300px] text-sm">
                <thead>
                  <tr className="bg-accent-2/80 dark:bg-dark-800 border-b border-white/25">
                    <th className="text-left px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Партия</th>
                    <th className="text-left px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Размер</th>
                    <th className="text-right px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Кол-во</th>
                  </tr>
                </thead>
                <tbody>
                  {(productionStages.warehouse || []).map((row, i) => (
                    <tr key={row.id ?? i} className="border-b border-white/10 dark:border-white/10">
                      <td className="px-4 py-2 text-[#ECECEC] dark:text-dark-text">{row.batch_code ?? row.batch ?? '—'}</td>
                      <td className="px-4 py-2 text-[#ECECEC]/90 dark:text-dark-text/80">{row.size_name ?? row.model_size_id ?? row.size_id ?? '—'}</td>
                      <td className="px-4 py-2 text-right text-[#ECECEC]/90 dark:text-dark-text/80">{row.qty ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 7. Отгрузка */}
      <div className="card-neon rounded-card overflow-hidden mt-4 sm:mt-6 transition-block">
        <div className="p-4 sm:p-6 border-b border-white/25 dark:border-white/25">
          <h2 className="text-base sm:text-lg font-medium text-[#ECECEC] dark:text-dark-text">Отгрузка</h2>
        </div>
        <div className="p-4 sm:p-6">
          {stagesLoading ? (
            <p className="text-[#ECECEC]/70 dark:text-dark-text/70 text-sm">Загрузка...</p>
          ) : !(productionStages?.shipping || []).length ? (
            <p className="text-[#ECECEC]/70 dark:text-dark-text/70 text-sm">Нет данных</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[300px] text-sm">
                <thead>
                  <tr className="bg-accent-2/80 dark:bg-dark-800 border-b border-white/25">
                    <th className="text-left px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Партия</th>
                    <th className="text-left px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Дата</th>
                    <th className="text-right px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90">Кол-во</th>
                  </tr>
                </thead>
                <tbody>
                  {(productionStages.shipping || []).map((s) => (
                    <tr key={s.id} className="border-b border-white/10 dark:border-white/10">
                      <td className="px-4 py-2 text-[#ECECEC] dark:text-dark-text">{s.batch_code ?? '—'}</td>
                      <td className="px-4 py-2 text-[#ECECEC]/90 dark:text-dark-text/80">
                        {s.shipped_at ? new Date(s.shipped_at).toLocaleDateString('ru-RU') : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-[#ECECEC]/90 dark:text-dark-text/80">{s.total_qty ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showOperationsSection && (
      <div className="card-neon rounded-card overflow-hidden transition-block">
        <div className="p-6 border-b border-white/25 dark:border-white/25">
          <h2 className="text-lg font-medium text-[#ECECEC] dark:text-dark-text mb-2">
            Операции заказа
          </h2>
          {ops.length > 0 && (
            <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80">
              Этаж: <span className="text-[#ECECEC] dark:text-dark-text">{order.BuildingFloor?.name || '—'}</span>
              {' · '}
              Технолог: <span className="text-[#ECECEC] dark:text-dark-text">{order.Technologist?.User?.name || '—'}</span>
            </p>
          )}
        </div>
        {!ops.length ? (
          <div className="p-4 sm:p-6 text-[#ECECEC]/80 dark:text-dark-text/80">Операции отсутствуют</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-white/20 dark:border-white/20">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                  Операция
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                  Швея
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                  План
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                  Факт
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                  Статус
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                  Дата
                </th>
              </tr>
            </thead>
            <tbody>
              {ops.map((op) => {
                const editable = canEditActual(user, op);
                const done = (op.actual_quantity ?? 0) >= (op.planned_quantity || 0);
                const displayVal = editingActual[op.id] !== undefined ? editingActual[op.id] : (op.actual_quantity ?? '');
                return (
                  <tr key={op.id} className="border-b border-white/15 dark:border-white/15">
                    <td className="px-4 py-3 text-[#ECECEC] dark:text-dark-text">
                      {op.Operation?.name}
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">
                      {op.Sewer?.User?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">
                      {op.planned_quantity}
                    </td>
                    <td className="px-4 py-3">
                      {editable ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={numInputValue(displayVal)}
                            onChange={(e) => handleActualChange(op.id, e.target.value)}
                            className="w-20 px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveActual(op)}
                            disabled={savingOp === op.id || editingActual[op.id] === undefined}
                            className="text-xs px-2 py-1 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                          >
                            {savingOp === op.id ? '…' : 'Сохранить'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[#ECECEC]/90 dark:text-dark-text/80">
                          {op.actual_quantity ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          done
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {done ? 'Выполнено' : 'Не выполнено'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 whitespace-nowrap">
                      {op.planned_date || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        {canComplete(user) && !isCompleted && ops.length > 0 && (
          <div className="p-6 border-t border-white/25 dark:border-white/25">
            <button
              type="button"
              onClick={() => setShowCompleteConfirm(true)}
              disabled={!allOpsDone || completing}
              title={
                !allOpsDone && notDoneOps.length > 0
                  ? notDoneOps.some((o) => (o.status || 'Ожидает') !== 'Готово')
                    ? 'Завершите операции по цепочке: раскрой → пошив → финиш'
                    : `Не заполнен факт: ${notDoneOps.map((o) => o.Operation?.name).join(', ')}`
                  : ''
              }
              className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {completing ? 'Завершение...' : 'Завершить заказ'}
            </button>
            {!allOpsDone && notDoneOps.length > 0 && (
              <p className="mt-2 text-sm text-amber-400">
                {notDoneOps.some((o) => (o.status || 'Ожидает') !== 'Готово')
                  ? 'Завершите операции по цепочке: раскрой → пошив → финиш'
                  : `Заполните факт по операциям: ${notDoneOps.map((o) => o.Operation?.name).join(', ')}`}
              </p>
            )}
          </div>
        )}
      </div>
      )}
      </div>

      {showOperationsSection && showCompleteConfirm && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-hidden">
          <div className="bg-accent-3 dark:bg-dark-900 rounded-xl p-4 sm:p-6 max-w-md w-full border border-white/25 dark:border-white/25">
            <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              Подтверждение
            </h2>
            <p className="text-[#ECECEC]/90 dark:text-dark-text/80 mb-6">
              Завершить заказ? Статус будет изменён на «Готов», заказ будет помечен как выполненный.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowCompleteConfirm(false)}
                className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleComplete}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700"
              >
                Завершить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showEditModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/75 flex items-center justify-center z-50 p-4 overflow-hidden">
          <div className="bg-[#2a2d35] rounded-xl p-4 sm:p-6 max-w-4xl w-full max-h-[90vh] overflow-auto border border-white/20 dark:border-white/20 shadow-2xl">
            <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              Редактировать заказ
            </h2>
            <form onSubmit={handleSaveEdit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-4">
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Клиент</label>
                  <select
                    value={editForm.client_id}
                    onChange={(e) => setEditForm({ ...editForm, client_id: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                    required
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">ТЗ / Код модели</label>
                  <input
                    type="text"
                    value={editForm.tz_code}
                    onChange={(e) => setEditForm({ ...editForm, tz_code: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Название модели</label>
                  <input
                    type="text"
                    value={editForm.model_name}
                    onChange={(e) => setEditForm({ ...editForm, model_name: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Тип модели</label>
                  <select
                    value={editForm.model_type || 'regular'}
                    onChange={(e) => setEditForm({ ...editForm, model_type: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                  >
                    <option value="regular">Обычная</option>
                    <option value="set">Комплект (двойка, тройка и т.д.)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Общее количество</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="0"
                    value={numInputValue(editForm.total_quantity)}
                    onChange={(e) => setEditForm({ ...editForm, total_quantity: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Дата поступления заказа</label>
                  <input
                    type="date"
                    value={editForm.receipt_date || ''}
                    onChange={(e) => setEditForm({ ...editForm, receipt_date: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                  />
                  <p className="mt-1 text-xs text-[#ECECEC]/55 dark:text-dark-text/50">
                    Можно указать дату в прошлом
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Дедлайн</label>
                  <input
                    type="date"
                    value={editForm.deadline}
                    onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Месяц плана</label>
                  <input
                    type="month"
                    value={editForm.planned_month}
                    onChange={(e) => setEditForm({ ...editForm, planned_month: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Цех пошива</label>
                  <select
                    value={editForm.workshop_id ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, workshop_id: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                  >
                    <option value="">—</option>
                    {workshops.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Рост</label>
                  <select
                    value={editForm.order_height_type === 'CUSTOM' ? 'CUSTOM' : String(editForm.order_height_value ?? 170)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'CUSTOM') {
                        setEditForm({ ...editForm, order_height_type: 'CUSTOM', order_height_value: editForm.order_height_value ?? 170 });
                      } else {
                        setEditForm({ ...editForm, order_height_type: 'PRESET', order_height_value: v === '165' ? 165 : 170 });
                      }
                    }}
                    className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                  >
                    <option value="165">165</option>
                    <option value="170">170</option>
                    <option value="CUSTOM">Другое</option>
                  </select>
                  {editForm.order_height_type === 'CUSTOM' && (
                    <input
                      type="number"
                      min={120}
                      max={220}
                      value={editForm.order_height_value ?? ''}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        setEditForm({ ...editForm, order_height_value: Number.isNaN(n) ? 170 : Math.min(220, Math.max(120, n)) });
                      }}
                      className="mt-1 w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text"
                      placeholder="120–220"
                    />
                  )}
                </div>
                {['admin', 'manager'].includes(user?.role) && (
                  <div>
                    <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Статус</label>
                    <select
                      value={editForm.status_id}
                      onChange={(e) => setEditForm({ ...editForm, status_id: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                    >
                      {statuses.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="mb-4">
                <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Комментарий</label>
                <textarea
                  value={editForm.comment}
                  onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                  rows={2}
                />
              </div>

              {/* Цвета и размеры (как при создании) */}
              <div className="border-t border-white/25 dark:border-white/25 pt-4 mt-4">
                <h3 className="text-sm font-semibold text-[#ECECEC] dark:text-dark-text mb-3">Цвета и размеры</h3>
                <div className="mb-3">
                  <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-2">Размеры</label>
                  <p className="text-xs text-[#ECECEC]/55 dark:text-dark-text/50 mb-2">Размерная сетка 38–56: подсветка выбранных; число и буква — один размер.</p>
                  <div className="rounded-xl border border-white/20 bg-accent-2/15 p-3 mb-4 overflow-x-auto">
                    <SizeGrid
                      value={sizeGridNumericFromSelection(editSelectedSizes)}
                      showQuantity={false}
                      onChange={(nums) => {
                        const keep = editSelectedSizes.filter((s) => {
                          const t = String(s).trim();
                          const n = parseInt(t, 10);
                          if (!Number.isNaN(n) && String(n) === t && GRID_NUM_SET.has(n)) return false;
                          const row = SIZE_GRID_MAP.find((m) => m.letter.toUpperCase() === t.toUpperCase());
                          if (row) return false;
                          if (t.toUpperCase() === '3XL') return false;
                          return true;
                        });
                        const merged = [...new Set([...keep, ...nums.map(String)])].sort(sortSizesForDisplay);
                        setEditSelectedSizes(merged);
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 items-center mb-2">
                    <span className="text-[#ECECEC]/60 dark:text-dark-text/60 text-xs mr-1">Цифровые:</span>
                    {[...NUMERIC_SIZES, ...editSelectedSizes.filter((s) => /^\d+$/.test(s) && !NUMERIC_SIZES.includes(s))].map((name) => (
                      <label key={name} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={editSelectedSizes.includes(name)}
                          onChange={(e) => {
                            if (e.target.checked) editAddSize(name);
                            else editRemoveSize(name);
                          }}
                          className="rounded"
                        />
                        <span className="text-[#ECECEC] dark:text-dark-text text-sm">{name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center mb-2">
                    <span className="text-[#ECECEC]/60 dark:text-dark-text/60 text-xs mr-1">Буквенные:</span>
                    {[...LETTER_SIZES, ...editSelectedSizes.filter((s) => !/^\d+$/.test(s) && !LETTER_SIZES.includes(s))].map((name) => (
                      <label key={name} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={editSelectedSizes.includes(name)}
                          onChange={(e) => {
                            if (e.target.checked) editAddSize(name);
                            else editRemoveSize(name);
                          }}
                          className="rounded"
                        />
                        <span className="text-[#ECECEC] dark:text-dark-text text-sm">{name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      type="text"
                      value={editNewSizeInput}
                      onChange={(e) => setEditNewSizeInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), editAddSize(editNewSizeInput.trim()))}
                      placeholder="+ Добавить размер"
                      className="px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text text-sm min-w-[120px]"
                    />
                    <button
                      type="button"
                      onClick={() => editAddSize(editNewSizeInput.trim())}
                      className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                    >
                      Добавить
                    </button>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-2">Цвета</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {editColors.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
                      >
                        {c}
                        <button type="button" onClick={() => editRemoveColor(c)} className="text-red-400 hover:text-red-300">×</button>
                      </span>
                    ))}
                    <div className="relative flex gap-2" ref={editColorDropdownRef}>
                      <input
                        ref={editColorInputRef}
                        type="text"
                        value={editNewColorInput}
                        onChange={(e) => setEditNewColorInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), editAddColor(editNewColorInput.trim()))}
                        onFocus={() => editNewColorInput?.trim().length >= 2 && editColorSuggestions.length > 0 && setEditColorDropdownOpen(true)}
                        placeholder="+ Добавить цвет"
                        className="px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text text-sm min-w-[120px]"
                      />
                      <button type="button" onClick={() => editAddColor(editNewColorInput.trim())} className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700">
                        Добавить
                      </button>
                      {editColorDropdownOpen && editColorSuggestions.length > 0 && (
                        <ul className="absolute z-10 w-full mt-1 py-1 bg-accent-2 dark:bg-dark-800 border border-white/25 dark:border-white/25 rounded-lg shadow-lg max-h-40 overflow-auto top-full left-0 min-w-[180px]">
                          {editColorSuggestions.map((c) => (
                            <li
                              key={c.id}
                              className="px-4 py-2 cursor-pointer hover:bg-accent-1/30 dark:hover:bg-dark-2 text-[#ECECEC] dark:text-dark-text text-sm"
                              onClick={() => editAddColor(c.name)}
                            >
                              {c.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
                {editSelectedSizes.length > 0 && editColors.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-white/25 dark:border-white/25 -mx-1">
                    <table className="w-full text-sm border-collapse min-w-[280px] table-fixed">
                      <thead>
                        <tr className="border-b border-white/20 dark:border-white/20">
                          <th className="text-left px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text/90">Цвет</th>
                          {editSelectedSizes.map((s) => (
                            <th key={s} className="px-2 py-2 font-medium text-[#ECECEC] dark:text-dark-text/90 text-center w-20">{s}</th>
                          ))}
                          <th className="px-3 py-2 font-medium text-[#ECECEC] dark:text-dark-text/90 text-center">Итого</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editColors.map((color, ci) => {
                          const rowSum = editSelectedSizes.reduce((a, s) => a + (parseInt(editGetCell(color, s), 10) || 0), 0);
                          return (
                            <tr key={color} className="border-b border-white/15 dark:border-white/15">
                              <td className="px-3 py-2 text-[#ECECEC] dark:text-dark-text">{color}</td>
                              {editSelectedSizes.map((size, si) => (
                                <td key={size} className="px-2 py-2 text-center w-20">
                                  <input
                                    ref={registerEditRef(ci, si)}
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={numInputValue(editGetCell(color, size))}
                                    onChange={(e) => editSetCell(color, size, e.target.value)}
                                    onKeyDown={handleEditKeyDown(ci, si)}
                                    className="w-16 min-w-16 mx-auto block px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text text-center text-sm box-border"
                                  />
                                </td>
                              ))}
                              <td className="px-2 py-2 text-center w-20">
                                <input
                                  type="number"
                                  min="0"
                                  value={editEditingRowTotal?.color === color ? editEditingRowTotal.value : String(rowSum)}
                                  onFocus={() => setEditEditingRowTotal({ color, value: String(rowSum) })}
                                  onChange={(e) => setEditEditingRowTotal((p) => (p?.color === color ? { ...p, value: e.target.value } : p))}
                                  onBlur={(e) => {
                                    editDistributeRowTotal(color, e.target.value);
                                    setEditEditingRowTotal(null);
                                  }}
                                  onKeyDown={(e) => e.key === 'Enter' && (e.target.blur(), e.preventDefault())}
                                  title="Введите итог — распределится по размерам автоматически"
                                  className="w-16 min-w-16 mx-auto block px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text text-center text-sm box-border font-medium"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-b border-white/20 dark:border-white/20">
                          <td className="px-3 py-2 font-medium">Итого</td>
                          {editSelectedSizes.map((size) => {
                            const colSum = editColors.reduce((a, c) => a + (parseInt(editGetCell(c, size), 10) || 0), 0);
                            return <td key={size} className="px-2 py-2 font-medium text-center w-20">{colSum}</td>;
                          })}
                          <td className={`px-3 py-2 font-bold text-center ${editMatrixSum === editTotalQty && editTotalQty > 0 ? 'text-green-400' : editMatrixSum > 0 ? 'text-red-400' : ''}`}>
                            {editMatrixSum}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                    <p className={`text-sm px-3 py-2 ${editMatrixSum === editTotalQty && editTotalQty > 0 ? 'text-green-400' : editMatrixSum > 0 ? 'text-red-400' : 'text-[#ECECEC]/80'}`}>
                      Сумма: {editMatrixSum} / {editTotalQty}
                      {editMatrixSum === editTotalQty && editTotalQty > 0 ? ' ✓' : editMatrixSum > 0 ? ' — не совпадает' : ''}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-3 justify-end pt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving || !editVariantsValid}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {viewingPhoto && createPortal(
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-hidden"
          onClick={() => setViewingPhoto(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xl"
            onClick={() => setViewingPhoto(null)}
            aria-label="Закрыть"
          >
            ×
          </button>
          <img
            src={viewingPhoto}
            alt="Фото"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}

      {cuttingCompleteModalTask && (
        <CompleteByFactModal
          task={{ ...cuttingCompleteModalTask, Order: order }}
          onClose={() => setCuttingCompleteModalTask(null)}
          onSave={(actualVariants, endDate) =>
            cuttingCompleteModalTask.status === 'Готово'
              ? handleCuttingEditActualVariants(cuttingCompleteModalTask, actualVariants, endDate)
              : handleCuttingCompleteByFact(cuttingCompleteModalTask, actualVariants, endDate)
          }
          isEditMode={cuttingCompleteModalTask.status === 'Готово'}
        />
      )}

      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-hidden">
          <div className="bg-accent-3 dark:bg-dark-900 rounded-xl p-4 sm:p-6 max-w-md w-full border border-white/25 dark:border-white/25">
            <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              Удалить заказ?
            </h2>
            <p className="text-[#ECECEC]/90 dark:text-dark-text/80 mb-6">
              Заказ «{order.title}» будет удалён безвозвратно. Все связанные операции и данные будут удалены.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg bg-red-500/80 text-white font-medium hover:bg-red-500"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ProcurementPlanModal
        open={showProcurementPlanModal}
        orderId={order?.id}
        onClose={() => setShowProcurementPlanModal(false)}
        onSaved={(res) => {
          if (res) setProcurement(res);
          setShowProcurementPlanModal(false);
        }}
        canEdit={canEditCutting}
      />
      <ProcurementViewModal
        open={showProcurementModal}
        orderId={order?.id}
        onClose={() => {
          setShowProcurementModal(false);
          if (order?.id) {
            api.orders.getProcurement(order.id).then(setProcurement).catch(() => {});
            loadProductionStages();
          }
        }}
      />
    </div>
  );
}
