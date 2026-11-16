import Link from 'next/link';
import { ArrowRight, CalendarDays, ClipboardList, Users } from 'lucide-react';
import { isStaff, requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayIST } from '@/lib/leave-utils';
import { formatDate } from '@/lib/format';
import { getApplyContext } from '@/lib/apply-context';
import { REQUEST_COLUMNS, type HrOverview, type LeaveOverview, type LeaveRequest, type LeaveTxn } from '@/lib/types';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatGroup } from '@/components/ui/StatGroup';
import { PersonCell } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { BalanceCards } from '@/components/BalanceCards';
import { RequestsTable } from '@/components/RequestsTable';
import { ActivityList } from '@/components/ActivityList';
import { WeekStrip, type DayPlan } from '@/components/WeekStrip';
import { TeamWeekStrip, type TeamDay } from '@/components/TeamWeekStrip';
import { PushPrompt } from '@/components/PushPrompt';
import { ApplyDialog } from './leave/ApplyDialog';
import { DecideForm } from './requests/DecideForm';

export const metadata = { title: 'Overview' };

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function DashboardPage() {
  const me = await requireProfile();
  const firstName = (me.full_name || me.email).split(/[\s@]/)[0];
  return isStaff(me.role)
    ? <StaffDashboard firstName={firstName} myEmployeeId={me.employee?.id} isSuper={me.role === 'superadmin'} />
    : <EmployeeDashboard firstName={firstName} employeeId={me.employee?.id} active={me.employee?.status === 'active'} />;
}

const typeLabel = (t: string) => (t === 'wfh' ? 'WFH' : t === 'casual' ? 'Casual leave' : 'Earned leave');
const range = (r: LeaveRequest) =>
  `${formatDate(r.start_date)}${r.end_date !== r.start_date ? ` – ${formatDate(r.end_date)}` : ''}${r.half_day ? ` (${r.half_day_session} half)` : ''}`;

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/* ---------------- Superadmin / Admin ---------------- */
async function StaffDashboard({ firstName, myEmployeeId, isSuper }: { firstName: string; myEmployeeId?: string; isSuper: boolean }) {
  const today = todayIST();
  const weekEndIso = addDays(today, 6);
  const supabase = await createClient();
  const [{ data: hrData }, { data: outData }, { data: pendData }, { data: hols }, { data: settings }] = await Promise.all([
    supabase.rpc('hr_overview'),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('status', 'approved')
      .lte('start_date', weekEndIso).gte('end_date', today).order('start_date'),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('status', 'pending').order('start_date', { ascending: true }).limit(6),
    supabase.from('holidays').select('holiday_date, name').gte('holiday_date', today).order('holiday_date').limit(10),
    supabase.from('app_settings').select('weekend_days').eq('id', 1).single(),
  ]);
  const hr = hrData as HrOverview | null;
  const upcoming = (outData ?? []) as unknown as LeaveRequest[];
  const pending = (pendData ?? []) as unknown as LeaveRequest[];
  const outToday = upcoming.filter((r) => r.start_date <= today);
  const later = upcoming.filter((r) => r.start_date > today);
  const totalPending = (hr?.pending_leave ?? 0) + (hr?.pending_wfh ?? 0);
  const holidays = (hols ?? []) as { holiday_date: string; name: string }[];
  const weekend = (settings?.weekend_days as number[]) ?? [0, 6];

  const teamWeek: TeamDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const on = upcoming.filter((r) => r.start_date <= date && r.end_date >= date);
    return {
      date,
      away: new Set(on.filter((r) => r.leave_type !== 'wfh').map((r) => r.employee_id)).size,
      wfh: new Set(on.filter((r) => r.leave_type === 'wfh').map((r) => r.employee_id)).size,
      holiday: holidays.find((h) => h.holiday_date === date)?.name,
      weekend: weekend.includes(new Date(`${date}T00:00:00Z`).getUTCDay()),
    };
  });

  const away = hr?.on_leave_today ?? 0, wfhToday = hr?.wfh_today ?? 0, total = hr?.total ?? 0;
  const inOffice = Math.max(0, total - away - wfhToday - (hr?.permanent_wfh ?? 0));
  const todayHoliday = holidays.find((h) => h.holiday_date === today);
  const summary = todayHoliday
    ? `It’s ${todayHoliday.name} — the office is closed today.`
    : `${away === 0 ? 'Nobody is' : `${away} ${away === 1 ? 'person is' : 'people are'}`} on leave and ${wfhToday} working from home today.`;
  const ask = totalPending === 0
    ? 'No requests need a decision.'
    : isSuper
      ? `${totalPending} request${totalPending === 1 ? ' needs' : 's need'} your decision.`
      : `${totalPending} request${totalPending === 1 ? ' is' : 's are'} waiting for a Superadmin.`;

  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-xl border border-line bg-white">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand via-orange-300 to-amber-200" />
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-48 h-64 w-64 rounded-full bg-amber-100/60 blur-3xl" />
        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="text-[13px] text-ink-500">{longDate(today)} · {isSuper ? 'Superadmin' : 'Admin'}</p>
            <h1 className="mt-1 font-display text-[34px] font-medium leading-tight text-ink sm:text-[40px]">{greeting()}, {firstName}</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-600">{summary} {ask}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {totalPending > 0 && (
                <Link href="/requests" className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-600">
                  Review requests <span className="rounded-full bg-white/25 px-1.5 text-xs">{totalPending}</span>
                </Link>
              )}
              <Link href="/calendar" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-sm font-medium text-ink hover:bg-zinc-50">Team calendar</Link>
              {isSuper && <Link href="/employees/new" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-sm font-medium text-ink hover:bg-zinc-50">Add employee</Link>}
            </div>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-line bg-white/80 backdrop-blur">
            {[
              { label: 'In office', value: inOffice, cls: 'text-ink' },
              { label: 'Away', value: away, cls: away ? 'text-brand-700' : 'text-ink' },
              { label: 'WFH', value: wfhToday + (hr?.permanent_wfh ?? 0), cls: 'text-sky-800' },
            ].map((t, i) => (
              <Link key={t.label} href="/calendar" className={`px-4 py-3.5 transition-colors hover:bg-zinc-50 ${i ? 'border-l border-line' : ''}`}>
                <p className="text-xs text-ink-500">{t.label}</p>
                <p className={`mt-1 font-display text-[28px] font-semibold leading-none ${t.cls}`}>{t.value}</p>
              </Link>
            ))}
            <p className="col-span-3 border-t border-line px-4 py-2 text-2xs text-ink-500">Today · WFH includes {hr?.permanent_wfh ?? 0} permanent remote</p>
          </div>
        </div>
      </section>

      {isSuper && <PushPrompt />}

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-ink-500">Team availability · next 7 days</h2>
          <Link href="/calendar" className="text-[13px] font-medium text-brand-700 hover:underline">Calendar</Link>
        </div>
        <TeamWeekStrip days={teamWeek} today={today} headcount={Math.max(0, total - (hr?.permanent_wfh ?? 0))} />
      </section>

      <StatGroup title="Headcount" stats={[
        { label: 'Active employees', value: total, href: '/employees' },
        { label: 'Office', value: hr?.office ?? 0, href: '/employees?category=office' },
        { label: 'Hybrid', value: hr?.hybrid ?? 0, href: '/employees?category=hybrid' },
        { label: 'Permanent WFH', value: hr?.permanent_wfh ?? 0, href: '/employees?category=permanent_wfh' },
      ]} />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader
            title="Needs a decision"
            description={totalPending ? `${totalPending} request${totalPending === 1 ? '' : 's'} beyond balance` : undefined}
            action={totalPending > pending.length ? <Link href="/requests" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">All requests <ArrowRight className="h-3.5 w-3.5" /></Link> : undefined}
          />
          {pending.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Nothing to decide" description="Leave within balance is approved automatically." />
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((r) => (
                <li key={r.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <PersonCell name={r.employee?.full_name ?? '—'} href={r.employee ? `/employees/${r.employee.id}` : undefined}
                      sub={`${typeLabel(r.leave_type)} · ${range(r)} · ${Number(r.days)} day${Number(r.days) === 1 ? '' : 's'}`} />
                    {isSuper
                      ? <DecideForm id={r.id} disabledReason={myEmployeeId && r.employee_id === myEmployeeId ? 'Needs another approver' : undefined} />
                      : <span className="text-xs text-ink-400">Awaiting Superadmin</span>}
                  </div>
                  {r.reason && <p className="mt-2 border-l-2 border-line pl-3 text-[13px] text-ink-600">{r.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader title="Who’s out" action={<Link href="/calendar" className="text-[13px] font-medium text-brand-700 hover:underline">Calendar</Link>} />
          {[{ title: 'Today', rows: outToday }, { title: 'Next 7 days', rows: later }].map((b) => (
            <div key={b.title} className="border-b border-line last:border-b-0">
              <p className="bg-zinc-50 px-5 py-1.5 text-xs font-medium text-ink-500">{b.title} · {b.rows.length}</p>
              {b.rows.length === 0 ? (
                <p className="px-5 py-3 text-sm text-ink-400">Nobody.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {b.rows.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <PersonCell name={r.employee?.full_name ?? '—'} href={r.employee ? `/employees/${r.employee.id}` : undefined} sub={range(r)} />
                      <Badge tone={r.leave_type === 'wfh' ? 'neutral' : r.leave_type === 'casual' ? 'brand' : 'info'}>{r.leave_type === 'wfh' ? 'WFH' : r.leave_type === 'casual' ? 'CL' : 'EL'}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

/* ---------------- Employee ---------------- */
async function EmployeeDashboard({ firstName, employeeId, active }: { firstName: string; employeeId?: string; active: boolean }) {
  const today = todayIST();
  if (!employeeId) {
    return (
      <>
        <PageHeader title={`Welcome, ${firstName}`} description={longDate(today)} />
        <Card><EmptyState icon={Users} title="Your account isn’t set up yet" description="Ask HR to link your login to your employee record." /></Card>
      </>
    );
  }

  const weekEnd = addDays(today, 6);
  const supabase = await createClient();
  const [{ data: ov }, { data: reqs }, { data: txns }, { data: hols }, { data: team }, { data: me }] = await Promise.all([
    supabase.from('leave_overview').select('*').eq('employee_id', employeeId).maybeSingle(),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('employee_id', employeeId)
      .or(`status.eq.pending,end_date.gte.${today}`).neq('status', 'cancelled').neq('status', 'rejected').order('start_date').limit(8),
    supabase.from('leave_transactions').select('id, leave_type, kind, amount, balance_after, note, created_at')
      .eq('employee_id', employeeId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(4),
    supabase.from('holidays').select('id, holiday_date, name').gte('holiday_date', today).order('holiday_date').limit(10),
    supabase.rpc('team_calendar', { p_from: today, p_to: today }),
    supabase.from('employees').select('full_name').eq('id', employeeId).maybeSingle(),
  ]);
  const overview = ov as LeaveOverview | null;
  const upcoming = (reqs ?? []) as unknown as LeaveRequest[];
  const holidays = (hols ?? []) as { id: string; holiday_date: string; name: string }[];
  const ctx = await getApplyContext(overview);

  // ---- Next 7 days
  const week: DayPlan[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const hol = holidays.find((h) => h.holiday_date === date);
    if (hol) return { date, kind: 'holiday', label: hol.name };
    const r = upcoming.find((x) => x.start_date <= date && x.end_date >= date);
    if (r) return { date, kind: r.status === 'pending' ? 'pending' : r.leave_type === 'wfh' ? 'wfh' : 'leave', half: r.half_day };
    if (ctx.weekendDays.includes(dow)) return { date, kind: 'weekend' };
    return { date, kind: overview?.category === 'permanent_wfh' ? 'wfh' : 'work', label: overview?.category === 'permanent_wfh' ? 'Remote' : undefined };
  });
  const todayPlan = week[0];
  const todayText = {
    holiday: `It’s a holiday — ${todayPlan.label}. Enjoy!`,
    leave: 'You’re on leave today. Enjoy your time off.',
    wfh: overview?.category === 'permanent_wfh' ? 'Working remotely today.' : 'You’re working from home today.',
    pending: 'Today’s request is waiting for HR.',
    weekend: 'It’s the weekend — see you on Monday.',
    work: 'You’re in the office today.',
  }[todayPlan.kind];

  // ---- Summary sentence
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const cl = Number(overview?.casual ?? 0), el = Number(overview?.earned ?? 0), wfh = Number(overview?.wfh ?? 0);
  const parts = [
    cl < 0 ? `you owe ${fmt(-cl)} casual` : `${fmt(cl)} casual`,
    el < 0 ? `you owe ${fmt(-el)} earned` : `${fmt(el)} earned`,
    ...(overview?.category === 'permanent_wfh' ? [] : [wfh < 0 ? `${fmt(-wfh)} WFH owed` : `${fmt(wfh)} WFH this month`]),
  ];

  const nextHoliday = holidays.find((h) => h.holiday_date >= today);
  const inDays = nextHoliday ? daysBetween(today, nextHoliday.holiday_date) : null;
  const myName = (me?.full_name as string | undefined) ?? '';
  const teamOut = ((team ?? []) as { full_name: string; leave_type: string; half_day: boolean }[]).filter((t) => t.full_name !== myName);

  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-xl border border-line bg-white">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand via-orange-300 to-amber-200" />
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-40 h-64 w-64 rounded-full bg-amber-100/60 blur-3xl" />
        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.5fr_1fr] lg:items-end">
          <div>
            <p className="text-[13px] text-ink-500">{longDate(today)}</p>
            <h1 className="mt-1 font-display text-[34px] font-medium leading-tight text-ink sm:text-[40px]">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-600">
              {todayText} You have {parts.slice(0, -1).join(', ')}{parts.length > 1 ? ' and ' : ''}{parts[parts.length - 1]}.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <ApplyDialog ctx={ctx} disabled={!active} />
              <Link href="/calendar" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-sm font-medium text-ink hover:bg-zinc-50">Team calendar</Link>
              <span className="hidden text-xs text-ink-400 sm:inline">Tip: press <kbd className="rounded border border-line bg-zinc-50 px-1 font-mono text-[11px]">N</kbd> to apply</span>
            </div>
          </div>
          {nextHoliday && (
            <Link href="/holidays" className="group rounded-lg border border-line bg-white/80 p-4 backdrop-blur transition-colors hover:border-ink-300">
              <p className="text-xs font-medium text-ink-500">Next holiday</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="grid w-12 shrink-0 overflow-hidden rounded-md border border-line text-center leading-none">
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

      <PushPrompt compact />

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-ink-500">Your next 7 days</h2>
          <Link href="/leave" className="text-[13px] font-medium text-brand-700 hover:underline">My leave</Link>
        </div>
        <WeekStrip days={week} today={today} />
      </section>

      {overview && <BalanceCards row={overview} />}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader title="Pending & upcoming" action={<Link href="/leave" className="text-[13px] font-medium text-brand-700 hover:underline">All requests</Link>} />
          <RequestsTable rows={upcoming} empty="Nothing planned yet" emptyDescription="When you book time off it’ll show up here." />
        </Card>
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title="Team today" action={<Link href="/calendar" className="text-[13px] font-medium text-brand-700 hover:underline">Calendar</Link>} />
            {teamOut.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-500">Everyone’s in today.</p>
            ) : (
              <ul className="divide-y divide-line">
                {teamOut.slice(0, 6).map((t) => (
                  <li key={t.full_name + t.leave_type} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <PersonCell name={t.full_name} />
                    <Badge tone={t.leave_type === 'wfh' ? 'info' : 'brand'}>{t.leave_type === 'wfh' ? 'WFH' : 'Away'}{t.half_day ? ' ½' : ''}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Recent activity" />
            <ActivityList rows={(txns ?? []) as LeaveTxn[]} />
          </Card>
        </div>
      </div>
    </>
  );
}
