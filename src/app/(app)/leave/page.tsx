import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { REQUEST_COLUMNS, type LeaveOverview, type LeaveRequest } from '@/lib/types';
import { todayIST } from '@/lib/leave-utils';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { BalanceCards } from '@/components/BalanceCards';
import { RequestsTable } from '@/components/RequestsTable';
import { ApplyForm } from './ApplyForm';
import { CancelButton } from './CancelButton';

export default async function MyLeavePage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: emp } = await supabase.from('employees').select('id, status').eq('profile_id', me.id).maybeSingle();

  if (!emp) {
    return (
      <>
        <PageHeader title="My leave" />
        <Card className="max-w-md p-5 text-sm text-ink-600">Your login isn’t linked to an employee record yet. Ask a Superadmin to add you.</Card>
      </>
    );
  }

  const today = todayIST();
  const year = Number(today.slice(0, 4));
  const [{ data: ov }, { data: reqs }, { data: settings }, { data: hols }] = await Promise.all([
    supabase.from('leave_overview').select('*').eq('employee_id', emp.id).maybeSingle(),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('employee_id', emp.id)
      .order('start_date', { ascending: false }).limit(100),
    supabase.from('app_settings').select('weekend_days').eq('id', 1).single(),
    supabase.from('holidays').select('holiday_date').gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year + 1}-12-31`),
  ]);

  const overview = ov as LeaveOverview | null;
  const requests = (reqs ?? []) as unknown as LeaveRequest[];
  const avail = (bal: number, pend: number) => Math.max(0, Number(bal) - Number(pend));
  const options = overview
    ? [
        { value: 'casual' as const, label: 'Casual Leave', available: avail(overview.casual, overview.pending_casual) },
        { value: 'earned' as const, label: 'Earned Leave', available: avail(overview.earned, overview.pending_earned) },
        ...(overview.category === 'permanent_wfh'
          ? []
          : [{ value: 'wfh' as const, label: 'WFH', available: avail(overview.wfh, overview.pending_wfh) }]),
      ]
    : [];

  return (
    <>
      <PageHeader title="My leave" description="Apply for leave or WFH and track your requests." />
      {overview && <BalanceCards row={overview} />}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold">New request</h2>
          {emp.status === 'active' ? (
            <ApplyForm
              options={options}
              weekendDays={(settings?.weekend_days as number[]) ?? [0, 6]}
              holidays={(hols ?? []).map((h) => h.holiday_date as string)}
              today={today}
            />
          ) : (
            <p className="text-sm text-ink-500">Your account is inactive.</p>
          )}
          <p className="mt-4 text-xs text-ink-400">
            Weekends and company holidays aren’t counted. Balances are deducted only when approved.
          </p>
        </Card>
        <Card className="overflow-x-auto lg:col-span-3">
          <h2 className="px-4 pt-4 text-sm font-semibold">My requests</h2>
          <RequestsTable
            rows={requests}
            action={(r) => (r.status === 'pending' ? <CancelButton id={r.id} /> : null)}
          />
        </Card>
      </div>
    </>
  );
}
