/**
 * Подстановка данных карточки «База моделей» в форму создания заказа.
 */

import { flattenFabricLike, flattenOpsLike } from '../components/CreateOrderModelSections';

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function fabricRateFromFlatItem(item) {
  if (item.price_per_unit != null && item.price_per_unit !== '') return String(item.price_per_unit);
  if (item.price != null && item.price !== '') return String(item.price);
  return '';
}

/** Фото из плоского массива API или из строк fabric_data / fittings_data (base64 / data URL). */
function mergeFabricRowPhoto(flatItem, fromGroupsRow) {
  const a = flatItem?.photo;
  if (typeof a === 'string' && a.trim() !== '') return a;
  const b = fromGroupsRow?.photo;
  if (typeof b === 'string' && b.trim() !== '') return b;
  return null;
}

export function fabricRowsFromModel(model) {
  const fromGroups = flattenFabricLike(model.fabric_data);
  if (Array.isArray(model.fabric) && model.fabric.length > 0) {
    return model.fabric.map((item, i) => ({
      id: newId('fab'),
      name: item.name != null ? String(item.name) : '',
      unit: item.unit != null ? String(item.unit) : '',
      qtyPerUnit:
        item.qty_per_unit != null && item.qty_per_unit !== ''
          ? String(item.qty_per_unit)
          : item.qty != null && item.qty !== ''
            ? String(item.qty)
            : '',
      rateSom: fabricRateFromFlatItem(item),
      photo: item?.photo || mergeFabricRowPhoto(item, fromGroups[i]) || null,
    }));
  }
  return fromGroups;
}

export function accessoriesRowsFromModel(model) {
  const fromGroups = flattenFabricLike(model.fittings_data);
  if (Array.isArray(model.accessories) && model.accessories.length > 0) {
    return model.accessories.map((item, i) => ({
      id: newId('acc'),
      name: item.name != null ? String(item.name) : '',
      unit: item.unit != null ? String(item.unit) : '',
      qtyPerUnit:
        item.qty_per_unit != null && item.qty_per_unit !== ''
          ? String(item.qty_per_unit)
          : item.qty != null && item.qty !== ''
            ? String(item.qty)
            : '',
      rateSom: fabricRateFromFlatItem(item),
      photo: item?.photo || mergeFabricRowPhoto(item, fromGroups[i]) || null,
    }));
  }
  return fromGroups;
}

export function opsRowsFromModel(model, groupsKey, flatKey) {
  const flat = model[flatKey];
  if (Array.isArray(flat) && flat.length > 0) {
    return flat.map((item) => ({
      id: newId('op'),
      name: item.name != null ? String(item.name) : '',
      normMinutes:
        item.time_norm != null && item.time_norm !== '' ? String(item.time_norm) : '',
      rateSom: item.price != null && item.price !== '' ? String(item.price) : '',
    }));
  }
  return flattenOpsLike(model[groupsKey]);
}

/**
 * @param {object} model — ответ GET /api/models-base/:id
 * @param {object} setters — setForm, setFabric, setAccessories, setCuttingOps, setSewingOps, setOtkOps
 */
export function applyModelsBaseToCreateOrder(model, setters) {
  const {
    setForm,
    setFabric,
    setAccessories,
    setCuttingOps,
    setSewingOps,
    setOtkOps,
  } = setters;
  const code = model.code != null ? String(model.code).trim().slice(0, 10) : '';
  const name = model.name != null ? String(model.name) : '';

  setForm((prev) => ({
    ...prev,
    model_name: name || prev.model_name,
    tz_code: code || prev.tz_code,
  }));

  setFabric(fabricRowsFromModel(model));
  setAccessories(accessoriesRowsFromModel(model));
  setCuttingOps(opsRowsFromModel(model, 'cutting_ops', 'cutting_ops_flat'));
  setSewingOps(opsRowsFromModel(model, 'sewing_ops', 'sewing_ops_flat'));
  setOtkOps(opsRowsFromModel(model, 'otk_ops', 'otk_ops_flat'));
}
