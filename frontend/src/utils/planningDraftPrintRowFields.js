/**
 * Универсальные геттеры полей строки печати планирования (разные формы API/UI).
 */

export function getArticle(row) {
  if (!row) return '';
  const O = row.Order || row.order;
  return (
    row.article ||
    O?.article_no ||
    O?.article ||
    row.Order?.article ||
    row.order?.article ||
    row.articleNumber ||
    row.tz ||
    ''
  );
}

export function getName(row) {
  if (!row) return '—';
  const O = row.Order || row.order;
  const v =
    row.name ||
    row.order_name ||
    O?.title ||
    O?.model_name ||
    O?.name ||
    row.order?.name ||
    row.title ||
    row.model_name ||
    row.productName ||
    '';
  const s = v != null ? String(v).trim() : '';
  return s || '—';
}

export function getQty(row) {
  if (!row) return '';
  const O = row.Order || row.order;
  const v =
    row.qty_order ??
    row.quantity ??
    O?.qty_order ??
    O?.total_quantity ??
    O?.quantity ??
    row.order?.quantity;
  if (v == null || v === '') return '';
  return v;
}

export function getPhoto(row) {
  if (!row) return null;
  const O = row.Order || row.order;
  if (row.image_url) return row.image_url;
  const ph = row.photos;
  if (Array.isArray(ph) && ph[0]) return ph[0];
  if (O?.photos?.[0]) return O.photos[0];
  if (row.order?.photos?.[0]) return row.order.photos[0];
  if (typeof O?.image === 'string' && O.image.trim()) return O.image.trim();
  if (row.photo) return row.photo;
  if (row.imageUrl) return row.imageUrl;
  return null;
}

export function getClient(row) {
  if (!row) return '—';
  const O = row.Order || row.order;
  const v =
    row.client ||
    row.client_name ||
    O?.client_name ||
    row.order?.client_name ||
    O?.Client?.name ||
    row.customerName ||
    '';
  const s = v != null ? String(v).trim() : '';
  return s || '—';
}
