/**
 * Фото модели заказа: превью-картинка + модальное окно при клике.
 * Фото берётся из order.photos[0]. Если нет — placeholder.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const PLACEHOLDER_SVG = (
  <svg className="w-full h-full text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

function LightboxModal({ src, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xl z-10"
        aria-label="Закрыть"
      >
        ×
      </button>
      <img
        src={src}
        alt="Фото модели"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}

/**
 * @param {Object} props
 * @param {string|null} props.photo - base64 URL (order.photos?.[0]) или null
 * @param {string} [props.modelName] - название модели (отображается справа от фото)
 * @param {string} [props.clientName] - клиент (опционально под моделью)
 * @param {number} [props.size] - размер превью в px, макс 300 (default 64)
 * @param {string} [props.className] - доп. классы для обёртки
 * @param {boolean} [props.inline] - если true, только превью без текста (для встраивания в ячейку)
 */
export default function ModelPhoto({ photo, modelName = '', clientName, size = 64, className = '', inline = false }) {
  const [showModal, setShowModal] = useState(false);
  const px = Math.min(size, 300);

  const thumb = (
    <div
      className="shrink-0 overflow-hidden rounded-lg border border-white/20 bg-black/20 cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center"
      style={{ width: px, height: px, minWidth: px, minHeight: px }}
      onClick={() => photo && setShowModal(true)}
    >
      {photo ? (
        <img src={photo} alt={modelName || 'Модель'} className="w-full h-full object-cover" />
      ) : (
        PLACEHOLDER_SVG
      )}
    </div>
  );

  return (
    <>
      <div className={`flex items-center gap-3 ${inline ? 'inline-flex' : ''} ${className}`}>
        {thumb}
        {!inline && (modelName || clientName) && (
          <div className="min-w-0">
            {modelName && <div className="font-medium text-inherit truncate">{modelName}</div>}
            {clientName && <div className="text-sm text-white/60 truncate">{clientName}</div>}
          </div>
        )}
      </div>
      {showModal && photo && (
        <LightboxModal src={photo} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
