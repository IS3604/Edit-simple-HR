import { Home, Palmtree, Sun, Wallet } from 'lucide-react';
import { days } from '@/lib/format';
import { EL_CAP, type LeaveOverview } from '@/lib/types';

type Card = {
  key: string; label: string; value: number; pending: number; hint: string; progress: number | null;
  icon: typeof Sun; tone: { chip: string; bar: string; edge: string }; unit?: string;
};

const TONES = {
  casual: { chip: 'bg-brand-50 text-brand-700 ring-brand-100', bar: 'bg-brand', edge: 'from-brand/70' },
  earned: { chip: 'bg-violet-50 text-violet-700 ring-violet-100', bar: 'bg-violet-500', edge: 'from-violet-500/70' },
  wfh: { chip: 'bg-sky-50 text-sky-700 ring-sky-100', bar: 'bg-sky-500', edge: 'from-sky-500/70' },
  unpaid: { chip: 'bg-rose-50 text-rose-700 ring-rose-100', bar: 'bg-rose-500', edge: 'from-rose-500/60' },
};

/** CL / EL / WFH balances + unpaid days. WFH is hidden for Permanent WFH employees. */
export function BalanceCards({ row }: { row: LeaveOverview }) {
  const elAtCap = Number(row.earned) >= EL_CAP;
  const unpaidMonth = Number(row.unpaid_month ?? 0), unpaidYear = Number(row.unpaid_year ?? 0);
  const cards: Card[] = [
    { key: 'casual', label: 'Casual leave', value: Number(row.casual), pending: Number(row.pending_casual), icon: Sun, tone: TONES.casual,
      hint: `+${days(row.casual_per_month)} each month · unused expires 31 Dec`, progress: null },
    { key: 'earned', label: 'Earned leave', value: Number(row.earned), pending: Number(row.pending_earned), icon: Palmtree, tone: TONES.earned,
      hint: elAtCap ? `At the ${EL_CAP}-day limit — monthly credit paused` : `+${days(row.earned_per_month)} each month · up to ${EL_CAP}`,
      progress: Math.min(100, (Number(row.earned) / EL_CAP) * 100) },
    ...(row.category === 'permanent_wfh' ? [] : [{
      key: 'wfh', label: 'WFH this month', value: Number(row.wfh), pending: Number(row.pending_wfh), icon: Home, tone: TONES.wfh,
      hint: `${days(row.wfh_per_month)} per month · resets on the 1st`,
      progress: Number(row.wfh_per_month) > 0 ? Math.min(100, (Number(row.wfh) / Number(row.wfh_per_month)) * 100) : null,
    }]),
    { key: 'unpaid', label: 'Unpaid leave', value: unpaidMonth, pending: Number(row.pending_unpaid ?? 0), icon: Wallet, tone: TONES.unpaid,
      hint: `${days(unpaidYear)} this year · salary is deducted`, progress: null, unit: 'this month' },
  ];

  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${cards.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
      {cards.map((c) => {
        const owed = c.key === 'wfh' && c.value < 0;
        const Icon = c.icon;
        return (
          <div key={c.key} className="relative overflow-hidden rounded-xl border border-line bg-white px-5 py-4 shadow-xs">
            <div aria-hidden className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${c.tone.edge} to-transparent`} />
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink-600">{c.label}</p>
              <span className={`grid h-7 w-7 place-items-center rounded-lg ring-1 ${c.tone.chip}`}><Icon className="h-3.5 w-3.5" /></span>
            </div>
            <p className="mt-1.5 flex items-baseline gap-1.5">
              <span className={`text-[28px] font-semibold leading-none tabular-nums ${owed ? 'text-red-600' : 'text-ink'}`}>{days(c.value)}</span>
              <span className="text-sm text-ink-500">{c.unit ?? (owed ? 'days owed' : 'days left')}</span>
            </p>
            {c.progress !== null && (
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-100" aria-hidden>
                <div className={`h-full rounded-full ${owed ? 'bg-red-400' : c.tone.bar}`} style={{ width: `${owed ? 100 : Math.max(0, c.progress)}%` }} />
              </div>
            )}
            <p className="mt-2.5 text-xs text-ink-500">{owed ? 'Shortfall is taken off next month’s WFH' : c.hint}</p>
            {c.pending > 0 && <p className="mt-1 text-xs font-medium text-amber-700">{days(c.pending)} day(s) awaiting HR approval</p>}
          </div>
        );
      })}
    </div>
  );
}
