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

/* ---------------- Superadmin / Admin ---------------- */
async function StaffDashboard({ firstName, myEmployeeId, isSuper }: { firstName: string; myEmployeeId?: string; isSuper: boolean }) {
  const today = todayIST();
  const weekEnd = new Date(`${today}T00:00:00Z`); weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const supabase = await createClient();
  const [{ data: hrData }, { data: outData }, { data: pendData }] = await Promise.all([
    supabase.rpc('hr_overview'),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('status', 'approved')
      .lte('start_date', weekEnd.toISOString().slice(0, 10)).gte('end_date', today).order('start_date'),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('status', 'pending').order('start_date', { ascending: true }).limit(6),
  ]);
  const hr = hrData as HrOverview | null;
  const upcoming = (outData ?? []) as unknown as LeaveRequest[];
  const pending = (pendData ?? []) as unknown as LeaveRequest[];
  const outToday = upcoming.filter((r) => r.start_date <= today);
  const later = upcoming.filter((r) => r.start_date > today);
  const totalPending = (hr?.pending_leave ?? 0) + (hr?.pending_wfh ?? 0);

  return (
    <>
      <PageHeader title={`Welcome back, ${firstName}`} description={longDate(today)} />
      {isSuper && <PushPrompt />}

      <div className="space-y-5">
        <StatGroup title="Team" stats={[
          { label: 'Active employees', value: hr?.total ?? 0, href: '/employees' },
          { label: 'Office', value: hr?.office ?? 0, href: '/employees?category=office' },
          { label: 'Hybrid', value: hr?.hybrid ?? 0, href: '/employees?category=hybrid' },
          { label: 'Permanent WFH', value: hr?.permanent_wfh ?? 0, href: '/employees?category=permanent_wfh' },
        ]} />
        <StatGroup title="Today" stats={[
          { label: 'On leave', value: hr?.on_leave_today ?? 0, href: '/calendar' },
          { label: 'Working from home', value: hr?.wfh_today ?? 0, href: '/calendar' },
          { label: 'Extra leave requests', value: hr?.pending_leave ?? 0, href: '/requests?status=pending&kind=leave', tone: 'attention' },
          { label: 'Extra WFH requests', value: hr?.pending_wfh ?? 0, href: '/requests?status=pending&kind=wfh', tone: 'attention' },
        ]} />
      </div>

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

  const supabase = await createClient();
  const [{ data: ov }, { data: reqs }, { data: txns }, { data: hols }] = await Promise.all([
    supabase.from('leave_overview').select('*').eq('employee_id', employeeId).maybeSingle(),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('employee_id', employeeId)
      .or(`status.eq.pending,end_date.gte.${today}`).neq('status', 'cancelled').neq('status', 'rejected').order('start_date').limit(8),
    supabase.from('leave_transactions').select('id, leave_type, kind, amount, balance_after, note, created_at')
      .eq('employee_id', employeeId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(4),
    supabase.from('holidays').select('id, holiday_date, name').gte('holiday_date', today).order('holiday_date').limit(4),
  ]);
  const overview = ov as LeaveOverview | null;
  const upcoming = (reqs ?? []) as unknown as LeaveRequest[];
  const ctx = await getApplyContext(overview);

  return (
    <>
      <PageHeader title={`Welcome back, ${firstName}`} description={longDate(today)}
        actions={<ApplyDialog ctx={ctx} disabled={!active} />} />
      <PushPrompt compact />
      {overview && <BalanceCards row={overview} />}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader title="Pending & upcoming" action={<Link href="/leave" className="text-[13px] font-medium text-brand-700 hover:underline">All requests</Link>} />
          <RequestsTable rows={upcoming} empty="Nothing planned" emptyDescription="Press N or use “Apply for leave / WFH” to request time off." />
        </Card>
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title="Recent activity" />
            <ActivityList rows={(txns ?? []) as LeaveTxn[]} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Upcoming holidays" action={<Link href="/holidays" className="text-[13px] font-medium text-brand-700 hover:underline">All</Link>} />
            {(hols ?? []).length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-500">No upcoming holidays.</p>
            ) : (
              <ul className="divide-y divide-line">
                {(hols ?? []).map((h) => (
                  <li key={h.id} className="flex items-center gap-3 px-5 py-2.5">
                    <CalendarDays className="h-4 w-4 text-ink-400" aria-hidden />
                    <span className="flex-1 text-sm">{h.name}</span>
                    <span className="text-xs text-ink-500">{formatDate(h.holiday_date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
