'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Home, PartyPopper, Plane, Sun, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';

export type Kind = 'casual' | 'earned' | 'wfh' | 'leave';
export type Entry = { employee_id: string | null; full_name: string; leave_type: Kind; start_date: string; end_date: string; half_day: boolean; half_day_session: string | null };

const KIND: Record<Kind, { label: string; badge: string; ring: string; dot: string }> = {
  casual: { label: 'Casual leave', badge: 'bg-brand-50 text-brand-700 ring-brand-200', ring: 'ring-brand', dot: 'bg-brand' },
  earned: { label: 'Earned leave', badge: 'bg-violet-50 text-violet-700 ring-violet-200', ring: 'ring-violet-500', dot: 'bg-violet-500' },
  leave: { label: 'On leave', badge: 'bg-brand-50 text-brand-700 ring-brand-200', ring: 'ring-brand', dot: 'bg-brand' },
  wfh: { label: 'Working from home', badge: 'bg-sky-50 text-sky-700 ring-sky-200', ring: 'ring-sky-500', dot: 'bg-sky-500' },
};
const SHORT: Record<Kind, string> = { casual: 'CL', earned: 'EL', leave: 'Leave', wfh: 'WFH' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function CalendarView({
  month, today, days, entries, holidays, weekend, staff, prevHref, nextHref, isCurrentMonth,
}: {
  month: string; today: string; days: string[]; entries: Entry[]; holidays: Record<string, string>; weekend: number[];
  staff: boolean; prevHref: string; nextHref: string; isCurrentMonth: boolean;
}) {
  const [y, m] = month.split('-').map(Number);
  const inMonth = (d: string) => d.slice(0, 7) === month;
  const isOff = (d: string) => weekend.includes(parse(d).getUTCDay()) || !!holidays[d];
  const onDay = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    for (const d of days) {
      map[d] = isOff(d) ? [] : entries.filter((e) => e.start_date <= d && e.end_date >= d)
        .sort((a, b) => (a.leave_type === 'wfh' ? 1 : 0) - (b.leave_type === 'wfh' ? 1 : 0) || a.full_name.localeCompare(b.full_name));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, entries, holidays, weekend]);

  const [selected, setSelected] = useState<string>(isCurrentMonth ? today : days.find((d) => inMonth(d) && !isOff(d)) ?? days[0]);

  // Month stats (working days in this month only)
  const monthDays = days.filter(inMonth);
  const personDays = (k: (e: Entry) => boolean) => monthDays.reduce((n, d) => n + onDay[d].filter(k).reduce((s, e) => s + (e.half_day ? 0.5 : 1), 0), 0);
  const leaveDays = personDays((e) => e.leave_type !== 'wfh');
  const wfhDays = personDays((e) => e.leave_type === 'wfh');
  const peopleAway = new Set(monthDays.flatMap((d) => onDay[d].filter((e) => e.leave_type !== 'wfh').map((e) => e.employee_id ?? e.full_name))).size;
  const busiest = monthDays.reduce<{ d: string; n: number } | null>((best, d) => {
    const n = onDay[d].filter((e) => e.leave_type !== 'wfh').length;
    return n > (best?.n ?? 0) ? { d, n } : best;
  }, null);
  const monthHolidays = Object.entries(holidays).filter(([d]) => inMonth(d)).sort();
  const fmtN = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const title = parse(`${month}-01`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const sel = onDay[selected] ?? [];
  const selDate = parse(selected);

  return (
    <>
      {/* Header */}
      <section className="relative mb-6 overflow-hidden rounded-xl border border-line bg-white">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand via-orange-300 to-amber-200" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-sky-100/70 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 p-6 sm:p-8">
          <div>
            <p className="text-[13px] text-ink-500">Team calendar</p>
            <h1 className="mt-1 font-display text-[34px] font-medium leading-tight text-ink sm:text-[40px]">{title}</h1>
            <p className="mt-2 text-[15px] text-ink-600">
              {staff ? 'Approved leave and WFH across the team.' : 'Who’s away or working from home — plan around your team.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href={prevHref} scroll={false} className="grid h-9 w-9 place-items-center rounded-md border border-line bg-white text-ink-600 hover:bg-zinc-50" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Link>
            {!isCurrentMonth && <Link href="/calendar" scroll={false} className="h-9 rounded-md border border-line bg-white px-3 text-[13px] font-medium leading-9 hover:bg-zinc-50">Today</Link>}
            <Link href={nextHref} scroll={false} className="grid h-9 w-9 place-items-center rounded-md border border-line bg-white text-ink-600 hover:bg-zinc-50" aria-label="Next month"><ChevronRight className="h-4 w-4" /></Link>
          </div>
        </div>
        <div className="relative grid grid-cols-2 border-t border-line sm:grid-cols-4">
          {[
            { icon: Users, label: 'People away', value: String(peopleAway) },
            { icon: Plane, label: 'Leave days', value: fmtN(leaveDays) },
            { icon: Home, label: 'WFH days', value: fmtN(wfhDays) },
            { icon: busiest ? CalendarDays : PartyPopper, label: busiest ? 'Busiest day' : 'Holidays', value: busiest ? `${busiest.d.slice(8)} ${parse(busiest.d).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })} · ${busiest.n}` : String(monthHolidays.length) },
          ].map((s, i) => (
            <div key={s.label} className={`flex items-center gap-3 px-5 py-3.5 ${i % 2 ? 'border-l border-line' : ''} ${i >= 2 ? 'border-t border-line sm:border-t-0' : ''} ${i ? 'sm:border-l' : ''}`}>
              <s.icon className="h-4 w-4 text-ink-400" aria-hidden />
              <div>
                <p className="text-xs text-ink-500">{s.label}</p>
                <p className="text-[17px] font-semibold tabular-nums text-ink">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        {/* Month grid */}
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="grid grid-cols-7 border-b border-line bg-zinc-50">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`px-2 py-2 text-center text-xs font-medium sm:text-left sm:px-3 ${i >= 5 ? 'text-ink-400' : 'text-ink-500'}`}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d, idx) => {
              const date = parse(d);
              const holiday = holidays[d];
              const off = isOff(d);
              const people = onDay[d];
              const away = people.filter((e) => e.leave_type !== 'wfh');
              const wfh = people.filter((e) => e.leave_type === 'wfh');
              const isToday = d === today;
              const isSel = d === selected;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelected(d)}
                  aria-pressed={isSel}
                  aria-label={`${date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}: ${holiday ?? (off ? 'weekend' : `${away.length} away, ${wfh.length} WFH`)}`}
                  className={`group relative flex min-h-[64px] flex-col border-line p-1.5 text-left transition-colors sm:min-h-[112px] sm:p-2.5
                    ${idx % 7 !== 6 ? 'border-r' : ''} ${idx < days.length - 7 ? 'border-b' : ''}
                    ${holiday ? 'bg-amber-50/70' : off ? 'bg-[repeating-linear-gradient(135deg,#fafafa_0,#fafafa_6px,#f4f4f5_6px,#f4f4f5_7px)]' : 'bg-white hover:bg-zinc-50'}
                    ${!inMonth(d) ? 'opacity-45' : ''}
                    ${isSel ? 'z-10 outline outline-2 -outline-offset-2 outline-ink' : ''}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs tabular-nums ${isToday ? 'bg-brand font-semibold text-white' : 'font-medium text-ink'}`}>{date.getUTCDate()}</span>
                    {!off && away.length > 0 && (
                      <span className="hidden rounded bg-brand-50 px-1 text-2xs font-semibold text-brand-700 sm:inline" title={`${away.length} away`}>{away.length}</span>
                    )}
                  </div>
                  {holiday && (
                    <span className="mt-1 flex items-center gap-1 truncate text-2xs font-medium text-amber-800"><PartyPopper className="h-3 w-3 shrink-0" /><span className="hidden truncate sm:inline">{holiday}</span></span>
                  )}
                  {!off && people.length > 0 && (
                    <>
                      {/* Desktop: avatar stack */}
                      <div className="mt-auto hidden items-center pt-2 sm:flex">
                        {people.slice(0, 3).map((e, i) => (
                          <span key={e.full_name + e.leave_type + i} className={`-ml-1.5 rounded-full ring-2 first:ml-0 ${KIND[e.leave_type].ring} ${e.half_day ? 'opacity-70' : ''}`} title={`${e.full_name} · ${SHORT[e.leave_type]}${e.half_day ? ' ½' : ''}`}>
                            <Avatar name={e.full_name} size="sm" />
                          </span>
                        ))}
                        {people.length > 3 && <span className="-ml-1.5 grid h-7 w-7 place-items-center rounded-full bg-zinc-100 text-2xs font-semibold text-ink-600 ring-2 ring-white">+{people.length - 3}</span>}
                      </div>
                      {/* Mobile: dots */}
                      <div className="mt-auto flex flex-wrap gap-0.5 pt-1 sm:hidden">
                        {people.slice(0, 6).map((e, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${KIND[e.leave_type].dot}`} />)}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-xs text-ink-500">
            {(staff ? (['casual', 'earned', 'wfh'] as Kind[]) : (['leave', 'wfh'] as Kind[])).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${KIND[k].dot}`} />{KIND[k].label}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><PartyPopper className="h-3 w-3 text-amber-700" />Holiday</span>
            <span className="inline-flex items-center gap-1.5"><span className="text-ink-400">½</span>Half day (faded)</span>
          </div>
        </div>

        {/* Day panel */}
        <aside className="rounded-xl border border-line bg-white lg:sticky lg:top-6">
          <div className="border-b border-line px-5 py-4">
            <p className="text-xs text-ink-500">{selected === today ? 'Today' : selDate.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' })}</p>
            <p className="font-display text-2xl font-medium text-ink">{selDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'UTC' })}</p>
          </div>
          {holidays[selected] ? (
            <div className="flex items-center gap-3 px-5 py-6 text-sm text-amber-900"><PartyPopper className="h-5 w-5 text-amber-600" /> {holidays[selected]} — office closed.</div>
          ) : weekend.includes(selDate.getUTCDay()) ? (
            <div className="flex items-center gap-3 px-5 py-6 text-sm text-ink-500"><Sun className="h-5 w-5 text-ink-400" /> Weekend.</div>
          ) : sel.length === 0 ? (
            <div className="px-5 py-6 text-sm text-ink-500">Everyone’s in. 🎉</div>
          ) : (
            <ul className="divide-y divide-line">
              {sel.map((e, i) => {
                const range = e.start_date === e.end_date ? null
                  : `${parse(e.start_date).getUTCDate()} ${parse(e.start_date).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })} – ${parse(e.end_date).getUTCDate()} ${parse(e.end_date).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })}`;
                const body = (
                  <div className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={e.full_name} size="sm" />
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate text-sm font-medium text-ink">{e.full_name}</p>
                      <p className="truncate text-xs text-ink-500">{e.half_day ? `${e.half_day_session === 'first' ? 'First' : 'Second'} half` : range ?? 'All day'}</p>
                    </div>
                    <span className={`rounded px-1.5 py-px text-xs font-medium ring-1 ring-inset ${KIND[e.leave_type].badge}`}>{SHORT[e.leave_type]}</span>
                  </div>
                );
                return <li key={e.full_name + i}>{e.employee_id ? <Link href={`/employees/${e.employee_id}`} className="block hover:bg-zinc-50">{body}</Link> : body}</li>;
              })}
            </ul>
          )}
          {monthHolidays.length > 0 && (
            <div className="border-t border-line px-5 py-4">
              <p className="mb-2 text-xs font-medium text-ink-500">Holidays this month</p>
              <ul className="space-y-1.5">
                {monthHolidays.map(([d, n]) => (
                  <li key={d}>
                    <button type="button" onClick={() => setSelected(d)} className="flex w-full items-center justify-between gap-2 text-left text-sm hover:text-brand-700">
                      <span className="truncate">{n}</span><span className="shrink-0 text-xs text-ink-500">{parse(d).getUTCDate()} {parse(d).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
