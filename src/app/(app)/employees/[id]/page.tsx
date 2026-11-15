import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CATEGORY_LABEL, EMPLOYEE_COLUMNS, ROLE_LABEL, type Employee, type LeaveOverview, type LeaveRequest, type LeaveTxn, type Role, REQUEST_COLUMNS } from '@/lib/types';
import { days, formatDate } from '@/lib/format';
import { BalanceCards } from '@/components/BalanceCards';
import { LedgerTable } from '@/components/LedgerTable';
import { RequestsTable } from '@/components/RequestsTable';
import { AllocationForm } from './AllocationForm';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmployeeForm } from '@/components/EmployeeForm';
import { updateEmployee } from '../actions';
import { StatusForm } from './StatusForm';
import { PasswordForm } from './PasswordForm';

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; linked?: string }>;
}) {
  const me = await requireProfile(['superadmin', 'admin']);
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from('employees').select(EMPLOYEE_COLUMNS).eq('id', id).maybeSingle();
  if (!data) notFound();
  const employee = data as Employee;

  let role: Role | null = null;
  if (employee.profile_id) {
    const { data: p } = await supabase.from('profiles').select('role').eq('id', employee.profile_id).maybeSingle();
    role = (p?.role as Role) ?? null;
  }
  const [{ data: ov }, { data: txns }, { data: reqs }] = await Promise.all([
    supabase.from('leave_overview').select('*').eq('employee_id', id).maybeSingle(),
    supabase
      .from('leave_transactions')
      .select('id, leave_type, kind, amount, balance_after, note, created_at')
      .eq('employee_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(30),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('employee_id', id)
      .order('start_date', { ascending: false }).limit(50),
  ]);
  const requests = (reqs ?? []) as unknown as LeaveRequest[];
  const overview = ov as LeaveOverview | null;
  const ledger = (txns ?? []) as LeaveTxn[];

  const isSuper = me.role === 'superadmin';
  const isSelf = employee.profile_id === me.id;

  return (
    <>
      <Link href="/employees" className="mb-4 inline-block text-sm text-ink-500 hover:text-ink">← Employees</Link>
      <div className="flex flex-wrap items-center gap-3">
        <PageHeader title={employee.full_name} description={`${employee.employee_code} · ${employee.email}`} />
      </div>
      <div className="-mt-3 mb-6 flex flex-wrap gap-2">
        <Badge tone={employee.status === 'active' ? 'success' : 'muted'}>{employee.status === 'active' ? 'Active' : 'Inactive'}</Badge>
        <Badge>{CATEGORY_LABEL[employee.category]}</Badge>
        {role && <Badge tone="brand">{ROLE_LABEL[role]}</Badge>}
      </div>

      {sp.created && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Employee added{sp.linked ? ' and linked to their existing login' : ' with a sign-in'}.
        </p>
      )}

      {overview && (
        <section className="mb-6">
          <BalanceCards row={overview} />
        </section>
      )}

      {isSuper ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold">Details</h2>
            <EmployeeForm action={updateEmployee} employee={employee} />
          </Card>
          <div className="space-y-6">
            {overview && (
              <Card className="p-6">
                <h2 className="mb-3 text-sm font-semibold">Monthly allocation</h2>
                <AllocationForm row={overview} />
              </Card>
            )}
            <Card className="p-6">
              <h2 className="mb-3 text-sm font-semibold">Account status</h2>
              <StatusForm id={employee.id} status={employee.status} isSelf={isSelf} />
            </Card>
            {employee.profile_id && !isSelf && (
              <Card className="p-6">
                <h2 className="mb-3 text-sm font-semibold">Reset password</h2>
                <PasswordForm id={employee.id} />
              </Card>
            )}
          </div>
        </div>
      ) : (
        <Card className="max-w-2xl p-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Item label="Department" value={employee.department} />
            <Item label="Designation" value={employee.designation} />
            <Item label="Joining date" value={formatDate(employee.joining_date)} />
            <Item label="Category" value={CATEGORY_LABEL[employee.category]} />
            {overview && (
              <Item
                label="Monthly allocation"
                value={`CL ${days(overview.casual_per_month)} · EL ${days(overview.earned_per_month)} · WFH ${days(overview.wfh_per_month)}`}
              />
            )}
          </dl>
        </Card>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Leave history</h2>
        <Card className="overflow-x-auto">
          <RequestsTable rows={requests} />
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Balance history</h2>
        <Card className="overflow-x-auto">
          <LedgerTable rows={ledger} />
        </Card>
      </section>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 font-medium">{value || '—'}</dd>
    </div>
  );
}
