import { CalendarOff, Home, PartyPopper, Hourglass } from 'lucide-react';

export type DayPlan = { date: string; kind: 'holiday' | 'leave' | 'wfh' | 'pending' | 'weekend' | 'work'; label?: string; half?: boolean };

const style: Record<DayPlan['kind'], string> = {
  holiday: 'bg-amber-50 text-amber-800 ring-amber-200',
  leave: 'bg-brand-50 text-brand-700 ring-brand-200',
  wfh: 'bg-sky-50 text-sky-800 ring-sky-200',
  pending: 'bg-zinc-50 text-ink-600 ring-zinc-200 border-dashed',
  weekend: 'bg-zinc-50/60 text-ink-400 ring-transparent',
  work: 'bg-white text-ink-600 ring-line',
};
const icon = { holiday: PartyPopper, leave: CalendarOff, wfh: Home, pending: Hourglass } as const;
const text: Record<DayPlan['kind'], string> = { holiday: 'Holiday', leave: 'On leave', wfh: 'WFH', pending: 'Awaiting HR', weekend: 'Weekend', work: 'Office' };

/** Your next 7 days at a glance. */
export function WeekStrip({ days, today }: { days: DayPlan[]; today: string }) {
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {days.map((d) => {
        const date = new Date(`${d.date}T00:00:00Z`);
        const Icon = icon[d.kind as keyof typeof icon];
        const isToday = d.date === today;
        return (
          <div key={d.date} title={d.label ?? text[d.kind]}
            className={`relative flex min-h-[84px] flex-col rounded-lg p-2 ring-1 ring-inset transition-colors sm:p-2.5 ${style[d.kind]} ${isToday ? 'ring-2 ring-ink' : ''}`}>
            <span className="text-2xs font-medium uppercase tracking-wide opacity-70">
              {isToday ? 'Today' : date.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })}
            </span>
            <span className="font-display text-xl font-semibold leading-tight">{date.getUTCDate()}</span>
            <span className="mt-auto flex items-center gap-1 truncate text-2xs font-medium">
              {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
              <span className="hidden truncate sm:inline">{d.label ?? text[d.kind]}{d.half ? ' ½' : ''}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
