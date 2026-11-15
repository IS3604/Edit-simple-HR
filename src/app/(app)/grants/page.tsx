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

export const metadata = { title: 'Special grants' };

type GrantRow = {
  id: string; leave_type: LeaveType; days: number; reason: string; granted_on: string;
  employee: { id: string; full_name: string; employee_code: string } | null;
  granter: { full_name: string; email: string } | null;
};

export default async function GrantsPage() {
  await requireProfile(['superadmin']);
  const supabase = await createClient();
  const [{ data: emps }, { data: grants, error }] = await Promise.all([
    supabase.from('employees').select('id, full_name, employee_code').eq('status', 'active').order('full_name'),
    supabase.from('special_grants')
      .select('id, leave_type, days, reason, granted_on, employee:employees(id, full_name, employee_code), granter:profiles!special_grants_granted_by_fkey(full_name, email)')
      .order('created_at', { ascending: false }).limit(200),
  ]);
  const rows = (grants ?? []) as unknown as GrantRow[];

  return (
    <>
      <PageHeader title="Special grants" description="Extra leave or WFH outside the monthly allocation, tracked separately." />
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden lg:sticky lg:top-6 lg:col-span-2">
          <CardHeader title="New grant" description="Added to the balance immediately" />
          <div className="p-5">
            <GrantForm employees={(emps ?? []).map((e) => ({ id: e.id, label: `${e.full_name} (${e.employee_code})` }))} />
            <p className="mt-4 text-xs leading-relaxed text-ink-500">EL grants may take the balance above 20 days. WFH grants expire at month end.</p>
          </div>
        </Card>
        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader title="History" />
          {error ? (
            <p className="p-6 text-sm text-red-600">Could not load grants.</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={Gift} title="No special grants yet" />
          ) : (
            <TableScroll>
              <Table minWidth={600}>
                <thead><tr><Th>Employee</Th><Th>Grant</Th><Th>Reason</Th><Th>By</Th></tr></thead>
                <tbody>
                  {rows.map((g) => (
                    <Tr key={g.id}>
                      <Td>{g.employee ? <PersonCell name={g.employee.full_name} sub={formatDate(g.granted_on)} href={`/employees/${g.employee.id}`} /> : '—'}</Td>
                      <Td className="whitespace-nowrap font-medium text-emerald-700">+{days(g.days)} {LEAVE_SHORT[g.leave_type]}</Td>
                      <Td className="text-ink-600">{g.reason}</Td>
                      <Td className="text-ink-500">{g.granter?.full_name || g.granter?.email || '—'}</Td>
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
