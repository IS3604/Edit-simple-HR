import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  CATEGORY_LABEL, EMPLOYEE_COLUMNS, REQUEST_COLUMNS, ROLE_LABEL,
  type Employee, type LeaveOverview, type LeaveRequest, type LeaveTxn, type Role,
} from '@/lib/types';
import { days, formatDate } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { EmployeeForm } from '@/components/EmployeeForm';
import { BalanceCards } from '@/components/BalanceCards';
import { LedgerTable } from '@/components/LedgerTable';
import { RequestsTable } from '@/components/RequestsTable';
import { updateEmployee } from '../actions';
import { AllocationForm } from './AllocationForm';
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
  const [{ data }, { data: ov }, { data: txns }, { data: reqs }] = await Promise.all([
    supabase.from('employees').select(`${EMPLOYEE_COLUMNS}, profile:profiles!employees_profile_id_fkey(role)`).eq('id', id).maybeSingle(),
    supabase.from('leave_overview').select('*').eq('employee_id', id).maybeSingle(),
    supabase.from('leave_transactions').select('id, leave_type, kind, amount, balance_after, note, created_at')
      .eq('employee_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(30),
    supabase.from('leave_requests').select(REQUEST_COLUMNS).eq('employee_id', id).order('start_date', { ascending: false }).limit(50),
  ]);
  if (!data) notFound();

  const employee = data as unknown as Employee & { profile: { role: Role } | { role: Role }[] | null };
  const role = (Array.isArray(employee.profile) ? employee.profile[0]?.role : employee.profile?.role) ?? null;
  const overview = ov as LeaveOverview | null;
  const ledger = (txns ?? []) as LeaveTxn[];
  const requests = (reqs ?? []) as unknown as LeaveRequest[];
  const isSuper = me.role === 'superadmin';
  const isSelf = employee.profile_id === me.id;

  return (
    <>
      <Link href="/employees" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Employees
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={employee.full_name} size="lg" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold ">{employee.full_name}</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            <span className="font-mono text-xs">{employee.employee_code}</span> · {employee.email}
            {employee.designation && <> · {employee.designation}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
          <Badge tone={employee.status === 'active' ? 'success' : 'muted'} dot>{employee.status === 'active' ? 'Active' : 'Inactive'}</Badge>
          <Badge>{CATEGORY_LABEL[employee.category]}</Badge>
          {role && <Badge tone="brand">{ROLE_LABEL[role]}</Badge>}
        </div>
      </div>

      {sp.created && (
        <div role="status" className="mb-6 flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Employee added{sp.linked ? ' and linked to their existing login' : ' with a sign-in'}. {isSuper && 'Next: set their monthly allocation.'}
        </div>
      )}

      {overview && <BalanceCards row={overview} />}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        {isSuper ? (
          <Card className="overflow-hidden lg:col-span-2">
            <CardHeader title="Details" />
            <div className="p-5"><EmployeeForm action={updateEmployee} employee={employee} /></div>
          </Card>
        ) : (
          <Card className="overflow-hidden lg:col-span-2">
            <CardHeader title="Details" />
            <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
              <Item label="Department" value={employee.department} />
              <Item label="Designation" value={employee.designation} />
              <Item label="Joining date" value={formatDate(employee.joining_date)} />
              <Item label="Category" value={CATEGORY_LABEL[employee.category]} />
              {overview && (
                <Item label="Monthly allocation"
                  value={`CL ${days(overview.casual_per_month)} · EL ${days(overview.earned_per_month)}${overview.category === 'permanent_wfh' ? '' : ` · WFH ${days(overview.wfh_per_month)}`}`} />
              )}
            </dl>
          </Card>
        )}

        {isSuper && (
          <div className="space-y-6">
            {overview && (
              <Card className="overflow-hidden">
                <CardHeader title="Monthly allocation" description="Credited on the 1st of every month" />
                <div className="p-5"><AllocationForm row={overview} /></div>
              </Card>
            )}
            <Card className="overflow-hidden">
              <CardHeader title="Account status" />
              <div className="p-5"><StatusForm id={employee.id} status={employee.status} isSelf={isSelf} /></div>
            </Card>
            {employee.profile_id && !isSelf && (
              <Card className="overflow-hidden">
                <CardHeader title="Reset password" description="Set a new temporary password" />
                <div className="p-5"><PasswordForm id={employee.id} /></div>
              </Card>
            )}
          </div>
        )}
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Leave history" />
        <RequestsTable rows={requests} empty="No leave requests yet" />
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Balance history" description="Every credit, deduction, grant and expiry" />
        <LedgerTable rows={ledger} />
      </Card>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-1 font-medium text-ink">{value || '—'}</dd>
    </div>
  );
}
