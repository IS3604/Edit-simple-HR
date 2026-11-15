import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { REQUEST_COLUMNS, STATUS_LABEL, type LeaveRequest, type RequestStatus } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { RequestsTable } from '@/components/RequestsTable';
import { DecideForm } from './DecideForm';

const STATUSES: (RequestStatus | 'all')[] = ['pending', 'approved', 'rejected', 'cancelled', 'all'];
const KINDS = [
  { value: '', label: 'Leave & WFH' },
  { value: 'leave', label: 'Leave only' },
  { value: 'wfh', label: 'WFH only' },
];

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  const me = await requireProfile(['superadmin', 'admin']);
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as RequestStatus) ? (sp.status as RequestStatus | 'all') : 'pending';
  const kind = sp.kind === 'leave' || sp.kind === 'wfh' ? sp.kind : '';

  const supabase = await createClient();
  const { data: myEmp } = await supabase.from('employees').select('id').eq('profile_id', me.id).maybeSingle();

  let query = supabase.from('leave_requests').select(REQUEST_COLUMNS);
  if (status !== 'all') query = query.eq('status', status);
  if (kind === 'wfh') query = query.eq('leave_type', 'wfh');
  if (kind === 'leave') query = query.in('leave_type', ['casual', 'earned']);
  query = status === 'pending'
    ? query.order('start_date', { ascending: true })
    : query.order('start_date', { ascending: false }).limit(200);
  const { data, error } = await query;
  const rows = (data ?? []) as unknown as LeaveRequest[];

  const href = (s: string, k = kind) => `/requests?status=${s}${k ? `&kind=${k}` : ''}`;

  return (
    <>
      <PageHeader title="Requests" description="Approve or reject leave and WFH. Balance is deducted on approval." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-white p-1">
          {STATUSES.map((s) => (
            <Link key={s} href={href(s)}
              className={`rounded-md px-3 py-1.5 text-sm ${status === s ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-600 hover:bg-canvas'}`}>
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <Link key={k.value} href={href(status, k.value)}
              className={`rounded-md px-3 py-1.5 text-sm ${kind === k.value ? 'font-medium text-ink' : 'text-ink-500 hover:text-ink'}`}>
              {k.label}
            </Link>
          ))}
        </div>
      </div>

      <Card className="overflow-x-auto">
        {error ? (
          <p className="p-6 text-sm text-red-600">Could not load requests. Refresh to try again.</p>
        ) : (
          <RequestsTable
            rows={rows}
            showEmployee
            empty={status === 'pending' ? 'Nothing waiting for approval.' : 'No requests found.'}
            action={(r) =>
              r.status === 'pending' ? (
                <DecideForm id={r.id} disabledReason={myEmp && r.employee_id === myEmp.id ? 'Your own request — another approver must decide.' : undefined} />
              ) : null
            }
          />
        )}
      </Card>
    </>
  );
}
