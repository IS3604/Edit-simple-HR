import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CATEGORIES, CATEGORY_LABEL, EL_CAP, type EmployeeCategory, type LeaveOverview } from '@/lib/types';
import { days } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

type Search = { q?: string; category?: string };

export default async function BalancesPage({ searchParams }: { searchParams: Promise<Search> }) {
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
      <PageHeader title="Leave balances" description="Current balances for active employees. Pending requests are not yet deducted." />

      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search name or ID" className="input w-full sm:w-64" aria-label="Search" />
        <select name="category" defaultValue={category} className="input w-auto" aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <button type="submit" className="rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium hover:bg-canvas">Filter</button>
        {(q || category) && <Link href="/balances" className="self-center px-2 text-sm text-ink-500 hover:text-ink">Clear</Link>}
      </form>

      <Card className="overflow-x-auto">
        {error ? (
          <p className="p-6 text-sm text-red-600">Could not load balances. Refresh to try again.</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-ink-500">No active employees found.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">CL</th>
                <th className="px-4 py-3 text-right font-medium">EL</th>
                <th className="px-4 py-3 text-right font-medium">WFH (month)</th>
                <th className="px-4 py-3 text-right font-medium">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const pending = Number(r.pending_casual) + Number(r.pending_earned) + Number(r.pending_wfh);
                return (
                  <tr key={r.employee_id} className="hover:bg-canvas/60">
                    <td className="px-4 py-3">
                      <Link href={`/employees/${r.employee_id}`} className="font-medium hover:text-brand-700">{r.full_name}</Link>
                      <p className="font-mono text-xs text-ink-500">{r.employee_code}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-600">{CATEGORY_LABEL[r.category]}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {days(r.casual)}<span className="block text-xs text-ink-400">+{days(r.casual_per_month)}/mo</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {days(r.earned)}
                      <span className={`block text-xs ${Number(r.earned) >= EL_CAP ? 'text-brand-700' : 'text-ink-400'}`}>
                        {Number(r.earned) >= EL_CAP ? 'at cap' : `+${days(r.earned_per_month)}/mo`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.category === 'permanent_wfh' ? <span className="text-ink-400">—</span> : (
                        <>{days(r.wfh)}<span className="block text-xs text-ink-400">of {days(r.wfh_per_month)}</span></>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{pending > 0 ? days(pending) : <span className="text-ink-400">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
