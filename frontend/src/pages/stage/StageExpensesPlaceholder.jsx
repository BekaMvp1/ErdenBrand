export default function StageExpensesPlaceholder() {
  return (
    <div className="card-neon rounded-card p-4 overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="text-left text-neon-muted border-b border-white/10">
            <th className="py-2 pr-3">Статья расхода</th>
            <th className="py-2 pr-3">План (сом)</th>
            <th className="py-2 pr-3">Факт (сом)</th>
            <th className="py-2 pr-3">Разница</th>
            <th className="py-2 pr-3">Период</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={5} className="py-8 text-center text-neon-muted">
              Расходы не добавлены
            </td>
          </tr>
          <tr className="border-t border-white/10">
            <td className="pt-3 font-semibold">Итого</td>
            <td className="pt-3">0</td>
            <td className="pt-3">0</td>
            <td className="pt-3">0</td>
            <td className="pt-3">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
