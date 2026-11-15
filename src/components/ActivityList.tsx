import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { days, formatTimestamp } from '@/lib/format';
import { LEAVE_SHORT, TXN_LABEL, type LeaveTxn } from '@/lib/types';

/** Compact list of the latest balance changes. */
export function ActivityList({ rows }: { rows: LeaveTxn[] }) {
  if (rows.length === 0) return <p className="px-5 py-6 text-sm text-ink-500">No balance activity yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((t) => {
        const amt = Number(t.amount);
        const Icon = amt > 0 ? ArrowUpRight : amt < 0 ? ArrowDownRight : Minus;
        return (
          <li key={t.id} className="flex items-center gap-3 px-5 py-3">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${amt > 0 ? 'bg-emerald-50 text-emerald-700' : amt < 0 ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-ink-400'}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{TXN_LABEL[t.kind]} <span className="text-ink-500">· {LEAVE_SHORT[t.leave_type]}</span></p>
              <p className="truncate text-xs text-ink-500">{t.note || formatTimestamp(t.created_at)}</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-medium tabular-nums ${amt > 0 ? 'text-emerald-700' : amt < 0 ? 'text-red-600' : 'text-ink-400'}`}>{amt > 0 ? '+' : ''}{days(amt)}</p>
              <p className="text-xs text-ink-400">{formatTimestamp(t.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
