import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { LEAVE_SHORT, type LeaveType } from '@/lib/types';
import { days, formatDate } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { GrantForm } from './GrantForm';

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
      <PageHeader title="Special grants" description="Extra leave or WFH outside the monthly allocation. Recorded separately for tracking." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold">New grant</h2>
          <GrantForm employees={(emps ?? []).map((e) => ({ id: e.id, label: `${e.full_name} (${e.employee_code})` }))} />
          <p className="mt-4 text-xs text-ink-400">EL grants may take the balance above 20 days. WFH grants expire at month end.</p>
        </Card>
        <Card className="overflow-x-auto lg:col-span-3">
          <h2 className="px-4 pt-4 text-sm font-semibold">History</h2>
          {error ? (
            <p className="p-6 text-sm text-red-600">Could not load grants.</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-ink-500">No special grants yet.</p>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Grant</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((g) => (
                  <tr key={g.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-600">{formatDate(g.granted_on)}</td>
                    <td className="px-4 py-3">
                      {g.employee ? <Link href={`/employees/${g.employee.id}`} className="font-medium hover:text-brand-700">{g.employee.full_name}</Link> : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-emerald-700">+{days(g.days)} {LEAVE_SHORT[g.leave_type]}</td>
                    <td className="px-4 py-3 text-ink-600">{g.reason}</td>
                    <td className="px-4 py-3 text-ink-500">{g.granter?.full_name || g.granter?.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
