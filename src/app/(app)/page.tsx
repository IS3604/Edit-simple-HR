import Link from 'next/link';
import {
  ArrowRight, Briefcase, Building2, CalendarDays, CalendarOff, ClipboardList, Home, Laptop, Shuffle, Users,
} from 'lucide-react';
import { isStaff, requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayIST } from '@/lib/leave-utils';
import { formatDate } from '@/lib/format';
import { REQUEST_COLUMNS, type HrOverview, type LeaveOverview, type LeaveRequest, type LeaveTxn } from '@/lib/types';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { PersonCell } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonClass } from '@/components/ui/Button';
import { BalanceCards } from '@/components/BalanceCards';
import { RequestsTable } from '@/components/RequestsTable';
import { LedgerTable } from '@/components/LedgerTable';
import { DecideForm } from './requests/DecideForm';

export const metadata = { title: 'Dashboard' };

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default async function DashboardPage() {
  const me = await requireProfile();
  const firstName = (me.full_name || me.email).split(/[\s@]/)[0];
  return isStaff(me.role)
    ? <StaffDashboard firstName={firstName} myEmployeeId={me.employee?.id} isSuper={me.role === 'superadmin'} />
    : <EmployeeDashboard firstName={firstName} employeeId={me.employee?.id} />;
}

/* ---------------- Superadmin / Admin ---------------- */
async function StaffDashboard({ firstName, myEmployeeId, isSuper }: { firstName: string; myEmployeeId?: string; isSuper: boolean }) {
  const today = todayIST();
  const supabase = await createClient();
  const [{ data: hrData }, { data: outData }, { data: pendData }] = await Promise.all([
    supabase.rpc('hr_overview'),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('status', 'approved')
      .lte('start_date', today).gte('end_date', today).order('leave_type'),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('status', 'pending')
      .order('start_date', { ascending: true }).limit(6),
  ]);
  const hr = hrData as HrOverview | null;
  const outToday = (outData ?? []) as unknown as LeaveRequest[];
  const pending = (pendData ?? []) as unknown as LeaveRequest[];
  const onLeave = outToday.filter((r) => r.leave_type !== 'wfh');
  const onWfh = outToday.filter((r) => r.leave_type === 'wfh');
  const totalPending = (hr?.pending_leave ?? 0) + (hr?.pending_wfh ?? 0);

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName}`} description={formatDate(today)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total employees" value={hr?.total ?? 0} icon={Users} href="/employees" />
        <StatCard label="Office" value={hr?.office ?? 0} icon={Building2} href="/employees?category=office" />
        <StatCard label="Hybrid" value={hr?.hybrid ?? 0} icon={Shuffle} href="/employees?category=hybrid" />
        <StatCard label="Permanent WFH" value={hr?.permanent_wfh ?? 0} icon={Laptop} href="/employees?category=permanent_wfh" />
        <StatCard label="On leave today" value={hr?.on_leave_today ?? 0} icon={CalendarOff} />
        <StatCard label="On WFH today" value={hr?.wfh_today ?? 0} icon={Home} />
        <StatCard label="Extra leave requests" value={hr?.pending_leave ?? 0} icon={Briefcase} accent={(hr?.pending_leave ?? 0) > 0} href="/requests?status=pending&kind=leave" />
        <StatCard label="Extra WFH requests" value={hr?.pending_wfh ?? 0} icon={ClipboardList} accent={(hr?.pending_wfh ?? 0) > 0} href="/requests?status=pending&kind=wfh" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader
            title="Extra-day requests"
            description={totalPending ? `${totalPending} waiting for ${isSuper ? 'your' : 'Superadmin'} decision` : 'Beyond-balance requests appear here'}
            action={totalPending > pending.length
              ? <Link href="/requests" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">View all <ArrowRight className="h-3.5 w-3.5" /></Link>
              : undefined}
          />
          {pending.length === 0 ? (
            <EmptyState icon={ClipboardList} title="All caught up" description="Leave within balance is approved automatically." />
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-[180px] flex-1">
                    <PersonCell name={r.employee?.full_name ?? '—'} href={r.employee ? `/employees/${r.employee.id}` : undefined}
                      sub={`${r.leave_type === 'wfh' ? 'WFH' : r.leave_type === 'casual' ? 'Casual Leave' : 'Earned Leave'} · ${formatDate(r.start_date)}${r.end_date !== r.start_date ? ` → ${formatDate(r.end_date)}` : ''} · ${Number(r.days)}d`} />
                  </div>
                  {r.reason && <p className="w-full text-xs text-ink-500 sm:order-last">“{r.reason}”</p>}
                  {isSuper
                    ? <DecideForm id={r.id} disabledReason={myEmployeeId && r.employee_id === myEmployeeId ? 'Needs another approver' : undefined} />
                    : <span className="text-xs text-ink-400">Awaiting Superadmin</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          {[{ title: 'On leave today', rows: onLeave, icon: CalendarOff }, { title: 'Working from home today', rows: onWfh, icon: Home }].map((b) => (
            <Card key={b.title} className="overflow-hidden">
              <CardHeader title={b.title} action={<div className="flex items-center gap-2"><Badge>{b.rows.length}</Badge><Link href="/calendar" className="text-[13px] font-medium text-brand-700 hover:underline">Calendar</Link></div>} />
              {b.rows.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-500">Nobody today.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {b.rows.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <PersonCell name={r.employee?.full_name ?? '—'} href={r.employee ? `/employees/${r.employee.id}` : undefined}
                        sub={r.end_date !== today ? `Back after ${formatDate(r.end_date)}` : 'Today only'} />
                      {r.leave_type !== 'wfh' && <Badge tone={r.leave_type === 'casual' ? 'brand' : 'info'}>{r.leave_type === 'casual' ? 'CL' : 'EL'}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------------- Employee ---------------- */
async function EmployeeDashboard({ firstName, employeeId }: { firstName: string; employeeId?: string }) {
  const today = todayIST();
  if (!employeeId) {
    return (
      <>
        <PageHeader title={`${greeting()}, ${firstName}`} />
        <Card><EmptyState icon={Users} title="Your account isn’t set up yet" description="Ask HR to link your login to your employee record." /></Card>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: ov }, { data: reqs }, { data: txns }, { data: hols }] = await Promise.all([
    supabase.from('leave_overview').select('*').eq('employee_id', employeeId).maybeSingle(),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('employee_id', employeeId)
      .or(`status.eq.pending,end_date.gte.${today}`).neq('status', 'cancelled').neq('status', 'rejected')
      .order('start_date').limit(10),
    supabase.from('leave_transactions').select('id, leave_type, kind, amount, balance_after, note, created_at')
      .eq('employee_id', employeeId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(8),
    supabase.from('holidays').select('id, holiday_date, name').gte('holiday_date', today).order('holiday_date').limit(4),
  ]);
  const overview = ov as LeaveOverview | null;
  const upcoming = (reqs ?? []) as unknown as LeaveRequest[];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={formatDate(today)}
        actions={<Link href="/leave" className={buttonClass('primary')}>Apply for leave / WFH</Link>}
      />
      {overview && <BalanceCards row={overview} />}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader title="Pending & upcoming" action={<Link href="/leave" className="text-[13px] font-medium text-brand-700 hover:underline">All requests</Link>} />
          <RequestsTable rows={upcoming} empty="Nothing pending or upcoming" emptyDescription="Requests you submit will appear here." />
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Upcoming holidays" action={<Link href="/holidays" className="text-[13px] font-medium text-brand-700 hover:underline">Calendar</Link>} />
          {(hols ?? []).length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">No upcoming holidays added.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(hols ?? []).map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-700"><CalendarDays className="h-4 w-4" /></span>
                  <div className="leading-tight">
                    <p className="text-sm font-medium">{h.name}</p>
                    <p className="text-xs text-ink-500">{formatDate(h.holiday_date)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Recent balance activity" />
        <LedgerTable rows={(txns ?? []) as LeaveTxn[]} />
      </Card>
    </>
  );
}
