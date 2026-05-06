export default function StageReportPlaceholder() {
  return (
    <div className="card-neon rounded-card p-4 overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="text-left text-neon-muted border-b border-white/10">
            <th className="py-2 pr-3">№</th>
            <th className="py-2 pr-3">Наименование</th>
            <th className="py-2 pr-3">План</th>
            <th className="py-2 pr-3">Факт</th>
            <th className="py-2 pr-3">Дата</th>
            <th className="py-2 pr-3">Комментарий</th>
            <th className="py-2 pr-3">Сохранить</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={7} className="py-8 text-center text-neon-muted">
              Нет данных для отчета
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
