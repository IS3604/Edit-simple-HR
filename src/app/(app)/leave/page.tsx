import { CalendarCheck2 } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { buildApplyContext, fetchApplyBasics } from '@/lib/apply-context';
import { REQUEST_COLUMNS, type LeaveOverview, type LeaveRequest } from '@/lib/types';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { BalanceCards } from '@/components/BalanceCards';
import { RequestsTable } from '@/components/RequestsTable';
import { CancelButton } from '@/components/CancelButton';
import { ApplyDialog } from './ApplyDialog';

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

  const supabase = await createClient();
  const [{ data: ov }, { data: reqs }, basics] = await Promise.all([
    supabase.from('leave_overview').select('*').eq('employee_id', emp.id).maybeSingle(),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('employee_id', emp.id).order('start_date', { ascending: false }).limit(100),
    fetchApplyBasics(),
  ]);
  const overview = ov as LeaveOverview | null;
  const requests = (reqs ?? []) as unknown as LeaveRequest[];
  const ctx = buildApplyContext(overview, basics);
  const today = ctx.today;

  return (
    <>
      <PageHeader
        title="My leave"
        description="Your balances and every request you’ve made."
        actions={<ApplyDialog ctx={ctx} disabled={emp.status !== 'active'} />}
      />
      {overview && <BalanceCards row={overview} />}

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Requests" description="Cancel a pending request, or approved leave that hasn’t started." />
        <RequestsTable
          rows={requests}
          empty="No requests yet"
          emptyDescription="Use “Apply for leave / WFH” to make your first request."
          action={(r) =>
            r.status === 'pending' ? <CancelButton id={r.id} />
            : r.status === 'approved' && r.start_date > today ? <CancelButton id={r.id} approved />
            : null}
        />
      </Card>
    </>
  );
}
