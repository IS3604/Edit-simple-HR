import { Card } from '@/components/ui/Card';
import { days } from '@/lib/format';
import { EL_CAP, type LeaveOverview } from '@/lib/types';

/** CL / EL / WFH balance cards. WFH card is hidden for Permanent WFH employees. */
export function BalanceCards({ row }: { row: LeaveOverview }) {
  const cards = [
    {
      label: 'Casual Leave',
      value: row.casual,
      pending: row.pending_casual,
      hint: `+${days(row.casual_per_month)}/month · expires 31 Dec`,
    },
    {
      label: 'Earned Leave',
      value: row.earned,
      pending: row.pending_earned,
      hint: Number(row.earned) >= EL_CAP ? `At ${EL_CAP}-day cap · accrual paused` : `+${days(row.earned_per_month)}/month · max ${EL_CAP}`,
    },
    ...(row.category === 'permanent_wfh'
      ? []
      : [{ label: 'WFH this month', value: row.wfh, pending: row.pending_wfh, hint: 'Resets on the 1st' }]),
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} className="p-5">
          <p className="text-xs font-medium text-ink-500">{c.label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {days(c.value)} <span className="text-sm font-normal text-ink-400">days</span>
          </p>
          <p className="mt-1 text-xs text-ink-500">{c.hint}</p>
          {Number(c.pending) > 0 && (
            <p className="mt-2 text-xs text-brand-700">{days(c.pending)} pending approval</p>
          )}
        </Card>
      ))}
    </div>
  );
}
