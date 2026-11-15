import { days, formatTimestamp } from '@/lib/format';
import { LEAVE_SHORT, TXN_LABEL, type LeaveTxn } from '@/lib/types';

export function LedgerTable({ rows }: { rows: LeaveTxn[] }) {
  if (rows.length === 0) return <p className="p-6 text-sm text-ink-500">No balance activity yet.</p>;
  return (
    <table className="w-full min-w-[560px] text-sm">
      <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
        <tr>
          <th className="px-4 py-3 font-medium">Date</th>
          <th className="px-4 py-3 font-medium">Type</th>
          <th className="px-4 py-3 font-medium">Activity</th>
          <th className="px-4 py-3 text-right font-medium">Change</th>
          <th className="px-4 py-3 text-right font-medium">Balance</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((t) => {
          const amt = Number(t.amount);
          return (
            <tr key={t.id}>
              <td className="px-4 py-2.5 text-ink-600">{formatTimestamp(t.created_at)}</td>
              <td className="px-4 py-2.5 font-medium">{LEAVE_SHORT[t.leave_type]}</td>
              <td className="px-4 py-2.5">
                {TXN_LABEL[t.kind]}
                {t.note && <span className="block text-xs text-ink-500">{t.note}</span>}
              </td>
              <td className={`px-4 py-2.5 text-right tabular-nums ${amt > 0 ? 'text-emerald-700' : amt < 0 ? 'text-red-600' : 'text-ink-400'}`}>
                {amt > 0 ? '+' : ''}{days(amt)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{days(t.balance_after)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
