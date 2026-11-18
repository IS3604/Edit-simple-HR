import { Gift } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { LEAVE_SHORT, type LeaveType } from '@/lib/types';
import { days, formatDate } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PersonCell } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/Table';
import { GrantForm } from './GrantForm';
import { GrantActions } from './GrantActions';
import { Badge } from '@/components/ui/Badge';

export const metadata = { title: 'Special grants' };

type GrantRow = {
  id: string; leave_type: LeaveType; days: number; reason: string; granted_on: string; revoked_at: string | null; updated_at: string | null;
  revoked_days: number | null; revoke_owed: number | null;
  employee: { id: string; full_name: string; employee_code: string } | null;
  granter: { full_name: string; email: string } | null;
};

export default async function GrantsPage() {
  await requireProfile(['superadmin']);
  const supabase = await createClient();
  const [{ data: emps }, { data: grants, error }] = await Promise.all([
    supabase.from('leave_overview').select('employee_id, full_name, employee_code, category, casual, earned, wfh').eq('status', 'active').order('full_name'),
    supabase.from('special_grants')
      .select('id, leave_type, days, reason, granted_on, revoked_at, updated_at, revoked_days, revoke_owed, employee:employees(id, full_name, employee_code), granter:profiles!special_grants_granted_by_fkey(full_name, email)')
      .order('created_at', { ascending: false }).limit(200),
  ]);
  const rows = (grants ?? []) as unknown as GrantRow[];
  const balances = new Map((emps ?? []).map((e) => [e.employee_id as string, e]));
  const balOf = (empId: string, t: LeaveType) => Number((balances.get(empId) as Record<string, unknown> | undefined)?.[t] ?? 0);

  return (
    <>
      <PageHeader title="Grants & deductions" description="Add or take away CL, EL or WFH outside the monthly allocation. Every change is tracked." />
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden lg:sticky lg:top-6 lg:col-span-2">
          <CardHeader title="Adjust a balance" description="Applied immediately" />
          <div className="p-5">
            <GrantForm employees={(emps ?? []).map((e) => ({
              id: e.employee_id as string, label: `${e.full_name} (${e.employee_code})`,
              casual: Number(e.casual), earned: Number(e.earned), wfh: Number(e.wfh), permanentWfh: e.category === 'permanent_wfh',
            }))} />
            <p className="mt-4 text-xs leading-relaxed text-ink-500">EL grants may take the balance above 20 days. WFH grants expire at month end. Deductions can’t take a balance below 0.</p>
          </div>
        </Card>
        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader title="History" />
          {error ? (
            <p className="p-6 text-sm text-red-600">Could not load grants.</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={Gift} title="No grants or deductions yet" />
          ) : (
            <TableScroll>
              <Table minWidth={560}>
                <thead><tr><Th>Employee</Th><Th>Grant</Th><Th>Reason</Th><Th /></tr></thead>
                <tbody>
                  {rows.map((g) => (
                    <Tr key={g.id} className={g.revoked_at ? 'opacity-60' : ''}>
                      <Td>{g.employee ? <PersonCell name={g.employee.full_name} sub={formatDate(g.granted_on)} href={`/employees/${g.employee.id}`} /> : '—'}</Td>
                      <Td className="whitespace-nowrap">
                        <span className={`font-medium tabular-nums ${g.revoked_at ? 'text-ink-400 line-through' : Number(g.days) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                          {Number(g.days) < 0 ? '−' : '+'}{days(Math.abs(Number(g.days)))} {LEAVE_SHORT[g.leave_type]}
                        </span>
                        {g.revoked_at && <span className="ml-2"><Badge tone="muted">Revoked</Badge></span>}
                        {g.revoked_at && Number(g.days) > 0 && (
                          <span className="block text-xs text-ink-500">
                            {days(g.revoked_days ?? 0)} taken back
                            {Number(g.revoke_owed) > 0 && <> · {days(g.revoke_owed ?? 0)} used</>}
                          </span>
                        )}
                        {!g.revoked_at && g.updated_at && <span className="block text-xs text-ink-400">edited</span>}
                      </Td>
                      <Td className="text-ink-600">
                        {g.reason}
                        <span className="block text-xs text-ink-400">by {g.granter?.full_name || g.granter?.email || '—'}</span>
                      </Td>
                      <Td align="right">
                        {!g.revoked_at && g.employee && (
                          <GrantActions grant={{ id: g.id, leave_type: g.leave_type, days: g.days, reason: g.reason, employeeName: g.employee.full_name, balance: balOf(g.employee.id, g.leave_type) }} />
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          )}
        </Card>
      </div>
    </>
  );
}
