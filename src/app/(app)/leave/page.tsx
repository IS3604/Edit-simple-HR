import { CalendarCheck2 } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { REQUEST_COLUMNS, type LeaveOverview, type LeaveRequest } from '@/lib/types';
import { todayIST } from '@/lib/leave-utils';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { BalanceCards } from '@/components/BalanceCards';
import { RequestsTable } from '@/components/RequestsTable';
import { ApplyForm } from './ApplyForm';
import { CancelButton } from '@/components/CancelButton';

export const metadata = { title: 'My leave' };

export default async function MyLeavePage() {
  const me = await requireProfile(['employee']);
  const emp = me.employee;

  if (!emp) {
    return (
      <>
        <PageHeader title="My leave" />
        <Card><EmptyState icon={CalendarCheck2} title="Your account isn’t set up yet" description="Ask HR to link your login to your employee record." /></Card>
      </>
    );
  }

  const today = todayIST();
  const year = Number(today.slice(0, 4));
  const supabase = await createClient();
  const [{ data: ov }, { data: reqs }, { data: settings }, { data: hols }] = await Promise.all([
    supabase.from('leave_overview').select('*').eq('employee_id', emp.id).maybeSingle(),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('employee_id', emp.id)
      .order('start_date', { ascending: false }).limit(100),
    supabase.from('app_settings').select('weekend_days').eq('id', 1).single(),
    supabase.from('holidays').select('holiday_date').gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year + 1}-12-31`),
  ]);

  const overview = ov as LeaveOverview | null;
  const requests = (reqs ?? []) as unknown as LeaveRequest[];
  const options = overview
    ? [
        { value: 'casual' as const, label: 'Casual Leave', available: Number(overview.casual) },
        { value: 'earned' as const, label: 'Earned Leave', available: Number(overview.earned) },
        ...(overview.category === 'permanent_wfh' ? [] : [{ value: 'wfh' as const, label: 'WFH', available: Number(overview.wfh) }]),
      ]
    : [];

  return (
    <>
      <PageHeader title="My leave" description="Apply for leave or WFH and track your requests." />
      {overview && <BalanceCards row={overview} />}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden lg:sticky lg:top-6 lg:col-span-2">
          <CardHeader title="New request" description="Within balance → approved instantly. More than balance → goes to Superadmin." />
          <div className="p-5">
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
          </div>
        </Card>
        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader title="My requests" description="You can cancel pending requests, or approved leave that hasn’t started." />
          <RequestsTable
            rows={requests}
            empty="No requests yet"
            emptyDescription="Your leave and WFH requests will appear here."
            action={(r) =>
              r.status === 'pending' ? <CancelButton id={r.id} />
              : r.status === 'approved' && r.start_date > today ? <CancelButton id={r.id} approved />
              : null}
          />
        </Card>
      </div>
    </>
  );
}
