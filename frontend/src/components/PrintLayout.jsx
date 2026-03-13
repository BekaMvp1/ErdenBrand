/**
 * Общая обёртка для страниц печати: кнопки назад/печать + область документа
 */

import BackButton from './BackButton';

export default function PrintLayout({ title, backTo, backLabel, children }) {
  return (
    <div className="min-h-screen bg-white p-6">
      <div className="no-print flex items-center justify-between gap-4 mb-6">
        <BackButton
          to={backTo}
          className="border border-gray-300 text-gray-700 hover:bg-gray-50"
        />
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
