export default function StagePlanPlaceholder() {
  return (
    <div className="card-neon rounded-card p-4 overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="text-left text-neon-muted border-b border-white/10">
            <th className="py-2 pr-3">№</th>
            <th className="py-2 pr-3">Наименование</th>
            <th className="py-2 pr-3">Кол-во</th>
            <th className="py-2 pr-3">Дата плана</th>
            <th className="py-2 pr-3">Статус</th>
            <th className="py-2 pr-3">Действия</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={6} className="py-8 text-center text-neon-muted">
              Данные появятся после добавления плана
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
