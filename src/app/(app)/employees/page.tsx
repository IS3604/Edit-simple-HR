import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CATEGORIES, CATEGORY_LABEL, EMPLOYEE_COLUMNS, type Employee, type EmployeeCategory } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';

type Search = { q?: string; category?: string; status?: string };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Search> }) {
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
    // Strip characters that have meaning in PostgREST filter syntax.
    const safe = q.replace(/[%,()*\\:."']/g, ' ').trim();
    if (safe) query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,employee_code.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  const employees = (data ?? []) as Employee[];
  const filtered = Boolean(q || category || status !== 'active');

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Employees" description={`${employees.length} ${status === 'all' ? '' : status} employee${employees.length === 1 ? '' : 's'}`} />
        {me.role === 'superadmin' && (
          <Link href="/employees/new" className="inline-flex items-center rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-soft hover:bg-brand-600">
            Add employee
          </Link>
        )}
      </div>

      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search name, email or ID" className="input w-full sm:w-64" aria-label="Search" />
        <select name="category" defaultValue={category} className="input w-auto" aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select name="status" defaultValue={status} className="input w-auto" aria-label="Status">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <button type="submit" className="rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium hover:bg-canvas">Filter</button>
        {filtered && <Link href="/employees" className="self-center px-2 text-sm text-ink-500 hover:text-ink">Clear</Link>}
      </form>

      <Card className="overflow-x-auto">
        {error ? (
          <p className="p-6 text-sm text-red-600">Could not load employees. Refresh to try again.</p>
        ) : employees.length === 0 ? (
          <p className="p-6 text-sm text-ink-500">{filtered ? 'No employees match these filters.' : 'No employees yet.'}</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-canvas/60">
                  <td className="px-4 py-3">
                    <Link href={`/employees/${e.id}`} className="font-medium hover:text-brand-700">{e.full_name}</Link>
                    <p className="text-xs text-ink-500">{e.email}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{e.employee_code}</td>
                  <td className="px-4 py-3">
                    <p>{e.department || '—'}</p>
                    <p className="text-xs text-ink-500">{e.designation}</p>
                  </td>
                  <td className="px-4 py-3"><Badge>{CATEGORY_LABEL[e.category]}</Badge></td>
                  <td className="px-4 py-3 text-ink-600">{formatDate(e.joining_date)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={e.status === 'active' ? 'success' : 'muted'}>{e.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
