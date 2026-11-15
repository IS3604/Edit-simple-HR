import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayIST } from '@/lib/leave-utils';
import type { LeaveType } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata = { title: 'Team calendar' };

type Entry = { employee_id: string; full_name: string; leave_type: LeaveType; start_date: string; end_date: string; half_day: boolean; half_day_session: string | null };

const chip: Record<LeaveType, string> = {
  casual: 'bg-brand-50 text-brand-700 ring-brand-100',
  earned: 'bg-sky-50 text-sky-700 ring-sky-100',
  wfh: 'bg-zinc-100 text-ink-600 ring-zinc-200',
};
const short: Record<LeaveType, string> = { casual: 'CL', earned: 'EL', wfh: 'WFH' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireProfile(['superadmin', 'admin']);
  const sp = await searchParams;
  const today = todayIST();
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));

  // Grid: Monday-start weeks covering the month.
  const gridStart = new Date(first); gridStart.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const gridEnd = new Date(last); gridEnd.setUTCDate(last.getUTCDate() + (6 - ((last.getUTCDay() + 6) % 7)));

  const supabase = await createClient();
  const [{ data: entries }, { data: hols }, { data: settings }] = await Promise.all([
    supabase.rpc('team_calendar', { p_from: iso(gridStart), p_to: iso(gridEnd) }),
    supabase.from('holidays').select('holiday_date, name').gte('holiday_date', iso(gridStart)).lte('holiday_date', iso(gridEnd)),
    supabase.from('app_settings').select('weekend_days').eq('id', 1).single(),
  ]);
  const list = (entries ?? []) as Entry[];
  const holidayMap = new Map((hols ?? []).map((h) => [h.holiday_date as string, h.name as string]));
  const weekend = (settings?.weekend_days as number[]) ?? [0, 6];

  const days: Date[] = [];
  for (const d = new Date(gridStart); d <= gridEnd; d.setUTCDate(d.getUTCDate() + 1)) days.push(new Date(d));

  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const title = first.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const offCount = new Set(list.filter((e) => e.leave_type !== 'wfh').map((e) => e.employee_id)).size;

  return (
    <>
      <PageHeader
        title="Team calendar"
        description={`Approved leave and WFH · ${offCount} ${offCount === 1 ? 'person' : 'people'} on leave this view`}
        actions={
          <div className="flex items-center gap-1">
            <Link href={`/calendar?m=${prev}`} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-ink-500 shadow-xs hover:bg-canvas" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Link>
            <span className="min-w-[140px] text-center text-sm font-semibold">{title}</span>
            <Link href={`/calendar?m=${next}`} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-ink-500 shadow-xs hover:bg-canvas" aria-label="Next month"><ChevronRight className="h-4 w-4" /></Link>
            {month !== today.slice(0, 7) && <Link href="/calendar" className="ml-2 h-9 rounded-lg border border-line bg-white px-3 text-[13px] font-medium leading-9 shadow-xs hover:bg-canvas">Today</Link>}
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap gap-3 text-xs text-ink-500">
        {(['casual', 'earned', 'wfh'] as LeaveType[]).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ring-1 ring-inset ${chip[t]}`} />{t === 'casual' ? 'Casual leave' : t === 'earned' ? 'Earned leave' : 'WFH'}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-100 ring-1 ring-inset ring-amber-200" />Holiday</span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7">
            {WEEKDAYS.map((w) => (
              <div key={w} className="border-b border-line bg-zinc-50/80 px-3 py-2 text-xs font-medium text-ink-500">{w}</div>
            ))}
            {days.map((d) => {
              const key = iso(d);
              const inMonth = d.getUTCMonth() === m - 1;
              const isWeekend = weekend.includes(d.getUTCDay());
              const holiday = holidayMap.get(key);
              const isToday = key === today;
              const items = list.filter((e) => e.start_date <= key && e.end_date >= key);
              return (
                <div key={key} className={`min-h-[112px] border-b border-r border-line p-2 [&:nth-child(7n)]:border-r-0 ${
                  !inMonth ? 'bg-zinc-50/50' : holiday ? 'bg-amber-50/60' : isWeekend ? 'bg-zinc-50/70' : 'bg-white'}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-1">
                    <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs tabular-nums ${
                      isToday ? 'bg-brand font-semibold text-white' : inMonth ? 'font-medium text-ink' : 'text-ink-400'}`}>{d.getUTCDate()}</span>
                    {holiday && <span className="truncate text-2xs font-medium text-amber-700" title={holiday}>{holiday}</span>}
                  </div>
                  {!isWeekend && !holiday && (
                    <ul className="space-y-1">
                      {items.slice(0, 4).map((e) => (
                        <li key={e.employee_id + e.start_date}>
                          <Link href={`/employees/${e.employee_id}`} title={`${e.full_name} · ${short[e.leave_type]}${e.half_day ? ` (${e.half_day_session} half)` : ''}`}
                            className={`block truncate rounded px-1.5 py-0.5 text-2xs font-medium ring-1 ring-inset ${chip[e.leave_type]} ${inMonth ? '' : 'opacity-50'}`}>
                            {e.full_name.split(' ')[0]} · {short[e.leave_type]}{e.half_day ? ' ½' : ''}
                          </Link>
                        </li>
                      ))}
                      {items.length > 4 && <li className="px-1.5 text-2xs text-ink-500">+{items.length - 4} more</li>}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </>
  );
}
