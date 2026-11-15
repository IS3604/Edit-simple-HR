import { Scale } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CATEGORIES, CATEGORY_LABEL, EL_CAP, type EmployeeCategory, type LeaveOverview } from '@/lib/types';
import { days } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PersonCell } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Table, TableScroll, Td, Th } from '@/components/ui/Table';
import { RowLink } from '@/components/ui/RowLink';
import { FilterBar } from '@/components/FilterBar';

export const metadata = { title: 'Leave balances' };

function Cell({ value, sub, warn }: { value: string; sub: string; warn?: boolean }) {
  return (
    <>
      <span className="font-medium text-ink">{value}</span>
      <span className={`block text-xs ${warn ? 'text-amber-700' : 'text-ink-400'}`}>{sub}</span>
    </>
  );
}

export default async function BalancesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  await requireProfile(['superadmin', 'admin']);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 60);
  const category = CATEGORIES.includes(sp.category as EmployeeCategory) ? (sp.category as EmployeeCategory) : '';

  const supabase = await createClient();
  let query = supabase.from('leave_overview').select('*').eq('status', 'active').order('full_name');
  if (category) query = query.eq('category', category);
  if (q) {
    const safe = q.replace(/[%,()*\\:."']/g, ' ').trim();
    if (safe) query = query.or(`full_name.ilike.%${safe}%,employee_code.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  const rows = (data ?? []) as LeaveOverview[];

  return (
    <>
      <PageHeader title="Leave balances" description="Current balances for active employees. Pending requests are deducted only on approval." />
      <FilterBar
        q={q} placeholder="Search name or ID" clearHref="/balances" active={Boolean(q || category)}
        selects={[{ name: 'category', value: category, label: 'Category', options: [{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))] }]}
      />
      <Card className="overflow-hidden">
        {error ? (
          <p className="p-6 text-sm text-red-600">Could not load balances. Refresh to try again.</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={Scale} title="No active employees found" />
        ) : (
          <TableScroll>
            <Table minWidth={760}>
              <thead>
                <tr><Th>Employee</Th><Th>Category</Th><Th align="right">Casual</Th><Th align="right">Earned</Th><Th align="right">WFH (month)</Th><Th align="right">Pending</Th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pending = Number(r.pending_casual) + Number(r.pending_earned) + Number(r.pending_wfh);
                  const atCap = Number(r.earned) >= EL_CAP;
                  return (
                    <RowLink key={r.employee_id} href={`/employees/${r.employee_id}`}>
                      <Td><PersonCell name={r.full_name} sub={r.employee_code} href={`/employees/${r.employee_id}`} /></Td>
                      <Td className="text-ink-600">{CATEGORY_LABEL[r.category]}</Td>
                      <Td align="right"><Cell value={days(r.casual)} sub={`+${days(r.casual_per_month)}/mo`} /></Td>
                      <Td align="right"><Cell value={days(r.earned)} sub={atCap ? 'at cap' : `+${days(r.earned_per_month)}/mo`} warn={atCap} /></Td>
                      <Td align="right">
                        {r.category === 'permanent_wfh' ? <span className="text-ink-400">—</span> : <Cell value={days(r.wfh)} sub={`of ${days(r.wfh_per_month)}`} />}
                      </Td>
                      <Td align="right">{pending > 0 ? <Badge tone="warning">{days(pending)}</Badge> : <span className="text-ink-400">—</span>}</Td>
                    </RowLink>
                  );
                })}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </Card>
    </>
  );
}
