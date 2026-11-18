import Link from 'next/link';
import type { ApplyContext } from '@/app/(app)/leave/ApplyForm';
import { ApplyDialog } from '@/app/(app)/leave/ApplyDialog';

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Dark branded welcome panel for Superadmin / Admin. */
export function StaffHero({ today, isSuper, firstName, greeting, summary, ask, totalPending, inOffice, away, wfhToday, permanentWfh }: {
  today: string; isSuper: boolean; firstName: string; greeting: string; summary: string; ask: string;
  totalPending: number; inOffice: number; away: number; wfhToday: number; permanentWfh: number;
}) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#FFF4EC] via-white to-[#EEF6FC] shadow-card">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-brand/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 right-56 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-sky-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(232,98,47,.25)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_left,black,transparent_60%)]" />
      <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <p className="text-[13px] text-ink-500">{longDate(today)} · {isSuper ? 'Superadmin' : 'Admin'}</p>
          <h1 className="mt-1 font-display text-[34px] font-medium leading-tight text-ink sm:text-[40px]">{greeting}, {firstName}</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-600">{summary} {ask}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {totalPending > 0 && (
              <Link href="/requests" className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-600">
                Review requests <span className="rounded-full bg-white/25 px-1.5 text-xs">{totalPending}</span>
              </Link>
            )}
            <Link href="/calendar" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-sm font-medium text-ink shadow-xs hover:bg-zinc-50">Team calendar</Link>
            {isSuper && <Link href="/employees/new" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-sm font-medium text-ink shadow-xs hover:bg-zinc-50">Add employee</Link>}
          </div>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-line bg-white/80 shadow-xs backdrop-blur">
          {[
            { label: 'In office', value: inOffice, cls: 'text-ink', dot: 'bg-emerald-400' },
            { label: 'Away', value: away, cls: away ? 'text-brand-700' : 'text-ink', dot: 'bg-brand' },
            { label: 'WFH', value: wfhToday + permanentWfh, cls: 'text-sky-700', dot: 'bg-sky-400' },
          ].map((t, i) => (
            <Link key={t.label} href="/calendar" className={`px-4 py-3.5 transition-colors hover:bg-white ${i ? 'border-l border-line' : ''}`}>
              <p className="flex items-center gap-1.5 text-xs text-ink-500"><span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />{t.label}</p>
              <p className={`mt-1 font-display text-[28px] font-semibold leading-none ${t.cls}`}>{t.value}</p>
            </Link>
          ))}
          <p className="col-span-3 border-t border-line px-4 py-2 text-2xs text-ink-500">Today · WFH includes {permanentWfh} permanent remote</p>
        </div>
      </div>
    </section>
  );
}

/** Dark branded welcome panel for employees. */
export function EmployeeHero({ today, firstName, greeting, sentence, ctx, active, nextHoliday, inDays }: {
  today: string; firstName: string; greeting: string; sentence: string; ctx: ApplyContext; active: boolean;
  nextHoliday: { holiday_date: string; name: string } | null; inDays: number | null;
}) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#FFF4EC] via-white to-[#EEF6FC] shadow-card">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-brand/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 right-56 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-sky-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(232,98,47,.25)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_left,black,transparent_60%)]" />
      <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.5fr_1fr] lg:items-end">
        <div>
          <p className="text-[13px] text-ink-500">{longDate(today)}</p>
          <h1 className="mt-1 font-display text-[34px] font-medium leading-tight text-ink sm:text-[40px]">
            {greeting}, {firstName}
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-600">
            {sentence}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <ApplyDialog ctx={ctx} disabled={!active} />
            <Link href="/calendar" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-sm font-medium text-ink shadow-xs hover:bg-zinc-50">Team calendar</Link>
            <span className="hidden text-xs text-ink-400 sm:inline">Tip: press <kbd className="rounded border border-line bg-white px-1 font-mono text-[11px] text-ink-600">N</kbd> to apply</span>
          </div>
        </div>
        {nextHoliday && (
          <Link href="/holidays" className="group rounded-xl border border-line bg-white/80 p-4 shadow-xs backdrop-blur transition-colors hover:border-ink-300">
            <p className="text-xs font-medium text-ink-500">Next holiday</p>
            <div className="mt-2 flex items-center gap-3">
              <div className="grid w-12 shrink-0 overflow-hidden rounded-md border border-line bg-white text-center leading-none text-ink">
                <span className="bg-brand py-1 text-2xs font-semibold uppercase text-white">
                  {new Date(`${nextHoliday.holiday_date}T00:00:00Z`).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })}
                </span>
                <span className="py-1.5 font-display text-lg font-semibold">{new Date(`${nextHoliday.holiday_date}T00:00:00Z`).getUTCDate()}</span>
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{nextHoliday.name}</p>
                <p className="text-xs text-ink-500">{inDays === 0 ? 'Today' : inDays === 1 ? 'Tomorrow' : `In ${inDays} days`}</p>
              </div>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
