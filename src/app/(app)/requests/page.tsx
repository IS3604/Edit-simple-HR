import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayIST } from '@/lib/leave-utils';
import { REQUEST_COLUMNS, STATUS_LABEL, type LeaveRequest, type RequestStatus } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { RequestsTable } from '@/components/RequestsTable';
import { CancelButton } from '@/components/CancelButton';
import { DecideForm } from './DecideForm';

export const metadata = { title: 'Requests' };

const STATUSES: (RequestStatus | 'all')[] = ['pending', 'approved', 'rejected', 'cancelled', 'all'];
const TAB_LABEL: Record<RequestStatus | 'all', string> = { ...STATUS_LABEL, pending: 'Needs approval', all: 'All' };
const KINDS = [
  { value: '', label: 'All types' },
  { value: 'leave', label: 'Leave' },
  { value: 'wfh', label: 'WFH' },
];

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  const me = await requireProfile(['superadmin', 'admin']);
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as RequestStatus) ? (sp.status as RequestStatus | 'all') : 'pending';
  const kind = sp.kind === 'leave' || sp.kind === 'wfh' ? sp.kind : '';
  const isSuper = me.role === 'superadmin';
  const today = todayIST();

  const supabase = await createClient();
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
  const myEmployeeId = me.employee?.id;

  const action = (r: LeaveRequest) => {
    if (r.status === 'pending') {
      if (!isSuper) return <span className="text-xs text-ink-400">Awaiting Superadmin</span>;
      return <DecideForm id={r.id} disabledReason={myEmployeeId && r.employee_id === myEmployeeId ? 'Needs another approver' : undefined} />;
    }
    if (isSuper && r.status === 'approved' && r.start_date > today) return <CancelButton id={r.id} approved />;
    return null;
  };

  return (
    <>
      <PageHeader
        title="Requests"
        description={isSuper
          ? 'Leave within balance is approved automatically. Requests for extra days need your decision.'
          : 'Leave within balance is approved automatically. Extra-day requests are decided by a Superadmin.'}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-line bg-white p-0.5 shadow-xs" role="tablist" aria-label="Status">
          {STATUSES.map((s) => (
            <Link key={s} href={href(s)} role="tab" aria-selected={status === s}
              className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${status === s ? 'bg-ink font-medium text-white' : 'text-ink-600 hover:text-ink'}`}>
              {TAB_LABEL[s]}
            </Link>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5 shadow-xs" aria-label="Type">
          {KINDS.map((k) => (
            <Link key={k.value} href={href(status, k.value)}
              className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${kind === k.value ? 'bg-stone-100 font-medium text-ink' : 'text-ink-500 hover:text-ink'}`}>
              {k.label}
            </Link>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {error ? (
          <p className="p-6 text-sm text-red-600">Could not load requests. Refresh to try again.</p>
        ) : (
          <RequestsTable
            rows={rows}
            showEmployee
            actionHeader={status === 'pending' ? 'Decision' : ''}
            empty={status === 'pending' ? 'All caught up' : 'No requests found'}
            emptyDescription={status === 'pending' ? 'No extra-day requests are waiting.' : undefined}
            action={action}
          />
        )}
      </Card>
    </>
  );
}
