import { Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PersonCell } from '@/components/ui/Avatar';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/Table';
import { days, formatDate } from '@/lib/format';
import { LEAVE_SHORT, STATUS_LABEL, type LeaveRequest, type RequestStatus } from '@/lib/types';

const statusTone: Record<RequestStatus, 'warning' | 'success' | 'danger' | 'muted'> = {
  pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'muted',
};
const typeTone = { casual: 'brand', earned: 'info', wfh: 'neutral', unpaid: 'danger' } as const;

export function RequestsTable({
  rows,
  showEmployee = false,
  action,
  actionHeader = '',
  empty = 'No requests yet',
  emptyDescription,
}: {
  rows: LeaveRequest[];
  showEmployee?: boolean;
  action?: (r: LeaveRequest) => React.ReactNode;
  actionHeader?: string;
  empty?: string;
  emptyDescription?: string;
}) {
  if (rows.length === 0) return <EmptyState icon={Inbox} title={empty} description={emptyDescription} />;
  return (
    <TableScroll>
      <Table minWidth={showEmployee ? 860 : 640}>
        <thead>
          <tr>
            {showEmployee && <Th>Employee</Th>}
            <Th>Type</Th>
            <Th>Dates</Th>
            <Th align="right">Days</Th>
            <Th>Reason</Th>
            <Th>Status</Th>
            {action && <Th align="right">{actionHeader}</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.id}>
              {showEmployee && (
                <Td>
                  {r.employee
                    ? <PersonCell name={r.employee.full_name} sub={r.employee.employee_code} href={`/employees/${r.employee.id}`} />
                    : '—'}
                </Td>
              )}
              <Td><Badge tone={typeTone[r.leave_type]}>{LEAVE_SHORT[r.leave_type]}</Badge></Td>
              <Td className="whitespace-nowrap text-ink-700">
                {formatDate(r.start_date)}
                {r.end_date !== r.start_date && <span className="text-ink-400"> → </span>}
                {r.end_date !== r.start_date && formatDate(r.end_date)}
                {r.half_day && <span className="block text-xs text-ink-500">{r.half_day_session === 'first' ? 'First half' : 'Second half'}</span>}
              </Td>
              <Td align="right" className="font-medium">
                {days(r.days)}
                {Number(r.extra_days) > 0 && <span className="block text-xs font-normal text-amber-700">{days(r.extra_days)} beyond balance</span>}
                {r.leave_type === 'unpaid' && <span className="block text-xs font-normal text-red-700">Salary deducted</span>}
              </Td>
              <Td className="max-w-[240px] text-ink-600">
                <span className="line-clamp-2" title={r.reason || undefined}>{r.reason || <span className="text-ink-400">—</span>}</span>
              </Td>
              <Td>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={statusTone[r.status]} dot>{STATUS_LABEL[r.status]}</Badge>
                  {r.auto_approved && r.status === 'approved' && <Badge tone="muted">Auto</Badge>}
                  {r.is_extra && r.status === 'pending' && <Badge tone="brand">Extra days</Badge>}
                  {r.leave_type === 'unpaid' && r.status === 'pending' && <Badge tone="danger">Needs approval</Badge>}
                </div>
                {!r.auto_approved && (r.decision_note || r.decider?.full_name) && (
                  <p className="mt-1 max-w-[220px] text-xs text-ink-500">
                    {r.decider?.full_name && <>by {r.decider.full_name}</>}
                    {r.decider?.full_name && r.decision_note && ' · '}
                    {r.decision_note}
                  </p>
                )}
              </Td>
              {action && <Td align="right">{action(r)}</Td>}
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableScroll>
  );
}
