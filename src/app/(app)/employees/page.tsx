import Link from 'next/link';
import { Plus, Users } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CATEGORIES, CATEGORY_LABEL, EMPLOYEE_COLUMNS, type Employee, type EmployeeCategory } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { PersonCell } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, Td, Th } from '@/components/ui/Table';
import { RowLink } from '@/components/ui/RowLink';
import { buttonClass } from '@/components/ui/Button';
import { FilterBar } from '@/components/FilterBar';

export const metadata = { title: 'Employees' };

const catTone = { office: 'neutral', hybrid: 'info', permanent_wfh: 'brand' } as const;

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; status?: string }> }) {
  const me = await requireProfile(['superadmin', 'admin']);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 60);
  const category = CATEGORIES.includes(sp.category as EmployeeCategory) ? (sp.category as EmployeeCategory) : '';
  const status = sp.status === 'inactive' || sp.status === 'all' ? sp.status : 'active';

  const supabase = await createClient();
  let query = supabase.from('employees').select(EMPLOYEE_COLUMNS).order('full_name');
  if (status !== 'all') query = query.eq('status', status);
  if (category) query = query.eq('category', category);
  if (q) {
    const safe = q.replace(/[%,()*\\:."']/g, ' ').trim();
    if (safe) query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,employee_code.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  const employees = (data ?? []) as Employee[];
  const filtered = Boolean(q || category || status !== 'active');
  const isSuper = me.role === 'superadmin';

  return (
    <>
      <PageHeader
        title="Employees"
        description={`${employees.length} ${status === 'all' ? 'total' : status}`}
        actions={isSuper ? <Link href="/employees/new" className={buttonClass('primary')}><Plus className="h-4 w-4" /> Add employee</Link> : undefined}
      />

      <FilterBar
        q={q}
        placeholder="Search name, email or ID"
        clearHref="/employees"
        active={filtered}
        selects={[
          { name: 'category', value: category, label: 'Category', options: [{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))] },
          { name: 'status', value: status, label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All statuses' }] },
        ]}
      />

      <Card className="overflow-hidden">
        {error ? (
          <p className="p-6 text-sm text-red-600">Could not load employees. Refresh to try again.</p>
        ) : employees.length === 0 ? (
          <EmptyState icon={Users} title={filtered ? 'No matches' : 'No employees yet'}
            description={filtered ? 'Try a different search or filter.' : 'Add your first employee to get started.'}
            action={!filtered && isSuper ? <Link href="/employees/new" className={buttonClass('primary', 'sm')}>Add employee</Link> : undefined} />
        ) : (
          <TableScroll>
            <Table minWidth={760}>
              <thead>
                <tr><Th>Employee</Th><Th>ID</Th><Th>Department</Th><Th>Category</Th><Th>Joined</Th><Th>Status</Th></tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <RowLink key={e.id} href={`/employees/${e.id}`}>
                    <Td><PersonCell name={e.full_name} sub={e.email} href={`/employees/${e.id}`} /></Td>
                    <Td><span className="font-mono text-xs text-ink-600">{e.employee_code}</span></Td>
                    <Td>
                      <p className="text-ink-700">{e.department || '—'}</p>
                      {e.designation && <p className="text-xs text-ink-500">{e.designation}</p>}
                    </Td>
                    <Td><Badge tone={catTone[e.category]}>{CATEGORY_LABEL[e.category]}</Badge></Td>
                    <Td className="whitespace-nowrap text-ink-600">{formatDate(e.joining_date)}</Td>
                    <Td><Badge tone={e.status === 'active' ? 'success' : 'muted'} dot>{e.status === 'active' ? 'Active' : 'Inactive'}</Badge></Td>
                  </RowLink>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </Card>
    </>
  );
}
