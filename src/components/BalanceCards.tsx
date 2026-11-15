import { CalendarHeart, Home, Sparkles } from 'lucide-react';
import { days } from '@/lib/format';
import { EL_CAP, type LeaveOverview } from '@/lib/types';

/** CL / EL / WFH balance cards. WFH is hidden for Permanent WFH employees. */
export function BalanceCards({ row }: { row: LeaveOverview }) {
  const elAtCap = Number(row.earned) >= EL_CAP;
  const cards = [
    { label: 'Casual Leave', icon: CalendarHeart, value: row.casual, pending: row.pending_casual,
      hint: `+${days(row.casual_per_month)} / month · expires 31 Dec`, progress: null as number | null },
    { label: 'Earned Leave', icon: Sparkles, value: row.earned, pending: row.pending_earned,
      hint: elAtCap ? `At ${EL_CAP}-day cap · accrual paused` : `+${days(row.earned_per_month)} / month · max ${EL_CAP}`,
      progress: Math.min(100, (Number(row.earned) / EL_CAP) * 100) },
    ...(row.category === 'permanent_wfh' ? [] : [{
      label: 'WFH this month', icon: Home, value: row.wfh, pending: row.pending_wfh,
      hint: `of ${days(row.wfh_per_month)} · resets on the 1st`,
      progress: Number(row.wfh_per_month) > 0 ? Math.min(100, (Number(row.wfh) / Number(row.wfh_per_month)) * 100) : null,
    }]),
  ];

  return (
    <div className={`grid gap-4 ${cards.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {cards.map((c) => {
        const available = Math.max(0, Number(c.value) - Number(c.pending));
        return (
          <div key={c.label} className="rounded-xl border border-line bg-white p-5 shadow-soft">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink-500">
              <c.icon className="h-4 w-4 text-brand" aria-hidden />
              {c.label}
            </div>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="text-[32px] font-semibold leading-none tracking-tight tabular-nums">{days(c.value)}</span>
              <span className="text-sm text-ink-400">days</span>
            </p>
            {c.progress !== null && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-brand/80" style={{ width: `${c.progress}%` }} />
              </div>
            )}
            <p className="mt-3 text-xs text-ink-500">{c.hint}</p>
            {Number(c.pending) > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                {days(c.pending)} pending · {days(available)} available to apply
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
