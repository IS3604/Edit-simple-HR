import Link from 'next/link';

export type TeamDay = { date: string; away: number; wfh: number; holiday?: string; weekend: boolean };

/** Team availability for the next 7 days — counts per day. */
export function TeamWeekStrip({ days, today, headcount }: { days: TeamDay[]; today: string; headcount: number }) {
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {days.map((d) => {
        const date = new Date(`${d.date}T00:00:00Z`);
        const isToday = d.date === today;
        const off = d.weekend || !!d.holiday;
        const inOffice = Math.max(0, headcount - d.away - d.wfh);
        return (
          <Link key={d.date} href={`/calendar?m=${d.date.slice(0, 7)}`}
            title={d.holiday ?? (d.weekend ? 'Weekend' : `${d.away} away · ${d.wfh} WFH · ${inOffice} in office`)}
            className={`flex min-h-[92px] flex-col rounded-lg p-2 ring-1 ring-inset transition-colors hover:bg-zinc-50 sm:p-2.5 ${
              d.holiday ? 'bg-amber-50 ring-amber-200' : off ? 'bg-zinc-50/60 ring-transparent' : 'bg-white ring-line'} ${isToday ? 'ring-2 ring-ink' : ''}`}>
            <span className="text-2xs font-medium uppercase tracking-wide text-ink-500">
              {isToday ? 'Today' : date.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })}
            </span>
            <span className={`font-display text-xl font-semibold leading-tight ${off ? 'text-ink-400' : 'text-ink'}`}>{date.getUTCDate()}</span>
            <div className="mt-auto space-y-0.5 text-2xs font-medium">
              {d.holiday ? (
                <span className="block truncate text-amber-800">{d.holiday}</span>
              ) : d.weekend ? (
                <span className="text-ink-400">Weekend</span>
              ) : (
                <>
                  <span className={`flex items-center gap-1 ${d.away ? 'text-brand-700' : 'text-ink-400'}`}><span className="h-1.5 w-1.5 rounded-full bg-brand" />{d.away} away</span>
                  <span className={`flex items-center gap-1 ${d.wfh ? 'text-sky-800' : 'text-ink-400'}`}><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />{d.wfh} WFH</span>
                </>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
