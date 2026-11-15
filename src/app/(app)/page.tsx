import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayIST } from '@/lib/leave-utils';
import { REQUEST_COLUMNS, ROLE_LABEL, type HrOverview, type LeaveOverview, type LeaveRequest } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { BalanceCards } from '@/components/BalanceCards';
import { RequestsTable } from '@/components/RequestsTable';

export default async function DashboardPage() {
  const me = await requireProfile();
  const firstName = (me.full_name || me.email).split(' ')[0];
  const isStaff = me.role !== 'employee';
  const today = todayIST();
  const supabase = await createClient();

  const { data: emp } = await supabase.from('employees').select('id').eq('profile_id', me.id).maybeSingle();

  const [ovRes, myReqRes, hrRes, outRes] = await Promise.all([
    emp ? supabase.from('leave_overview').select('*').eq('employee_id', emp.id).maybeSingle() : Promise.resolve({ data: null }),
    emp ? supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('employee_id', emp.id).eq('status', 'pending').order('start_date')
        : Promise.resolve({ data: [] }),
    isStaff ? supabase.rpc('hr_overview') : Promise.resolve({ data: null }),
    isStaff ? supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('status', 'approved')
        .lte('start_date', today).gte('end_date', today).order('leave_type') : Promise.resolve({ data: [] }),
  ]);

  const overview = ovRes.data as LeaveOverview | null;
  const myPending = (myReqRes.data ?? []) as unknown as LeaveRequest[];
  const hr = hrRes.data as HrOverview | null;
  const outToday = (outRes.data ?? []) as unknown as LeaveRequest[];
  const onLeave = outToday.filter((r) => r.leave_type !== 'wfh');
  const onWfh = outToday.filter((r) => r.leave_type === 'wfh');

  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} description={`Signed in as ${ROLE_LABEL[me.role]}`} />

      {hr && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">HR overview</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total employees" value={hr.total} href="/employees" />
            <StatCard label="Office" value={hr.office} href="/employees?category=office" />
            <StatCard label="Hybrid" value={hr.hybrid} href="/employees?category=hybrid" />
            <StatCard label="Permanent WFH" value={hr.permanent_wfh} href="/employees?category=permanent_wfh" />
            <StatCard label="On leave today" value={hr.on_leave_today} />
            <StatCard label="On WFH today" value={hr.wfh_today} />
            <StatCard label="Pending leave requests" value={hr.pending_leave} href="/requests?status=pending&kind=leave" />
            <StatCard label="Pending WFH requests" value={hr.pending_wfh} href="/requests?status=pending&kind=wfh" />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[{ title: 'On leave today', rows: onLeave }, { title: 'WFH today', rows: onWfh }].map((b) => (
              <Card key={b.title} className="p-4">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">{b.title}</h3>
                {b.rows.length === 0 ? (
                  <p className="text-sm text-ink-500">Nobody.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {b.rows.map((r) => (
                      <li key={r.id} className="flex justify-between gap-3">
                        <Link href={`/employees/${r.employee?.id}`} className="font-medium hover:text-brand-700">{r.employee?.full_name}</Link>
                        <span className="text-ink-500">{r.leave_type === 'casual' ? 'CL' : r.leave_type === 'earned' ? 'EL' : 'WFH'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {overview ? (
        <section>
          {isStaff && <h2 className="mb-3 text-sm font-semibold">My balances</h2>}
          <BalanceCards row={overview} />
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">My pending requests</h2>
              <Link href="/leave" className="text-sm font-medium text-brand-700 hover:underline">Apply for leave / WFH →</Link>
            </div>
            <Card className="overflow-x-auto">
              <RequestsTable rows={myPending} empty="No pending requests." />
            </Card>
          </div>
        </section>
      ) : (
        !isStaff && (
          <Card className="max-w-md p-5 text-sm text-ink-600">
            Your login isn’t linked to an employee record yet. Ask a Superadmin to add you.
          </Card>
        )
      )}
    </>
  );
}
