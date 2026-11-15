import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { days, formatDate } from '@/lib/format';
import { LEAVE_SHORT, STATUS_LABEL, type LeaveRequest, type RequestStatus } from '@/lib/types';

const statusTone: Record<RequestStatus, 'brand' | 'success' | 'muted' | 'neutral'> = {
  pending: 'brand', approved: 'success', rejected: 'neutral', cancelled: 'muted',
};

export function RequestsTable({
  rows,
  showEmployee = false,
  action,
  empty = 'No requests yet.',
}: {
  rows: LeaveRequest[];
  showEmployee?: boolean;
  action?: (r: LeaveRequest) => React.ReactNode;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="p-6 text-sm text-ink-500">{empty}</p>;
  return (
    <table className="w-full min-w-[720px] text-sm">
      <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
        <tr>
          {showEmployee && <th className="px-4 py-3 font-medium">Employee</th>}
          <th className="px-4 py-3 font-medium">Type</th>
          <th className="px-4 py-3 font-medium">Dates</th>
          <th className="px-4 py-3 text-right font-medium">Days</th>
          <th className="px-4 py-3 font-medium">Reason</th>
          <th className="px-4 py-3 font-medium">Status</th>
          {action && <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.id} className="align-top">
            {showEmployee && (
              <td className="px-4 py-3">
                {r.employee ? (
                  <Link href={`/employees/${r.employee.id}`} className="font-medium hover:text-brand-700">{r.employee.full_name}</Link>
                ) : '—'}
                <p className="font-mono text-xs text-ink-500">{r.employee?.employee_code}</p>
              </td>
            )}
            <td className="px-4 py-3 font-medium">{LEAVE_SHORT[r.leave_type]}</td>
            <td className="whitespace-nowrap px-4 py-3 text-ink-600">
              {formatDate(r.start_date)}
              {r.end_date !== r.start_date && <> – {formatDate(r.end_date)}</>}
            </td>
            <td className="px-4 py-3 text-right tabular-nums">{days(r.days)}</td>
            <td className="max-w-[220px] px-4 py-3 text-ink-600">
              <span className="line-clamp-2">{r.reason || '—'}</span>
            </td>
            <td className="px-4 py-3">
              <Badge tone={statusTone[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              {(r.decision_note || r.decider?.full_name) && (
                <p className="mt-1 max-w-[200px] text-xs text-ink-500">
                  {r.decider?.full_name && <>by {r.decider.full_name}</>}
                  {r.decider?.full_name && r.decision_note && ' · '}
                  {r.decision_note}
                </p>
              )}
            </td>
            {action && <td className="px-4 py-3">{action(r)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
