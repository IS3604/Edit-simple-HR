import { days } from '@/lib/format';
import { EL_CAP, type LeaveOverview } from '@/lib/types';

/** CL / EL / WFH balances. WFH is hidden for Permanent WFH employees. */
export function BalanceCards({ row }: { row: LeaveOverview }) {
  const elAtCap = Number(row.earned) >= EL_CAP;
  const cards = [
    { label: 'Casual leave', value: row.casual, pending: row.pending_casual,
      hint: `+${days(row.casual_per_month)} each month · unused expires 31 Dec`, progress: null as number | null },
    { label: 'Earned leave', value: row.earned, pending: row.pending_earned,
      hint: elAtCap ? `At the ${EL_CAP}-day limit — monthly credit paused` : `+${days(row.earned_per_month)} each month · up to ${EL_CAP}`,
      progress: Math.min(100, (Number(row.earned) / EL_CAP) * 100) },
    ...(row.category === 'permanent_wfh' ? [] : [{
      label: 'WFH this month', value: row.wfh, pending: row.pending_wfh,
      hint: `${days(row.wfh_per_month)} per month · resets on the 1st`,
      progress: Number(row.wfh_per_month) > 0 ? Math.min(100, (Number(row.wfh) / Number(row.wfh_per_month)) * 100) : null,
    }]),
  ];

  return (
    <div className={`grid overflow-hidden rounded-lg border border-line bg-white ${cards.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {cards.map((c, i) => (
        <div key={c.label} className={`px-5 py-4 ${i > 0 ? 'border-t border-line sm:border-l sm:border-t-0' : ''}`}>
          <p className="text-[13px] font-medium text-ink-600">{c.label}</p>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-[28px] font-semibold leading-none tabular-nums text-ink">{days(c.value)}</span>
            <span className="text-sm text-ink-500">days left</span>
          </p>
          {c.progress !== null && (
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-100" aria-hidden>
              <div className="h-full rounded-full bg-brand" style={{ width: `${c.progress}%` }} />
            </div>
          )}
          <p className="mt-2.5 text-xs text-ink-500">{c.hint}</p>
          {Number(c.pending) > 0 && <p className="mt-1 text-xs font-medium text-amber-700">{days(c.pending)} extra day(s) awaiting approval</p>}
        </div>
      ))}
    </div>
  );
}
