/**
 * Общая обёртка для страниц печати: кнопки назад/печать + область документа
 */

import { useNavigate } from 'react-router-dom';

export default function PrintLayout({ title, backTo, backLabel = 'Назад', children }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-white p-6">
      <div className="no-print flex items-center justify-between gap-4 mb-6">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          ← {backLabel}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Печать
        </button>
      </div>

      <div className="print-area max-w-3xl mx-auto bg-white text-black">
        {title && (
          <h1 className="print-title text-xl font-bold mb-6 text-center">
            {title}
          </h1>
        )}
        {children}
      </div>
    </div>
  );
}
