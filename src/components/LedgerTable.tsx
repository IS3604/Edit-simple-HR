import { History } from 'lucide-react';
import { days, formatTimestamp } from '@/lib/format';
import { LEAVE_SHORT, TXN_LABEL, type LeaveTxn } from '@/lib/types';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';

export function LedgerTable({ rows }: { rows: LeaveTxn[] }) {
  if (rows.length === 0) return <EmptyState icon={History} title="No balance activity yet" description="Monthly credits, approvals and grants will appear here." />;
  return (
    <TableScroll>
      <Table minWidth={600}>
        <thead>
          <tr><Th>Date</Th><Th>Type</Th><Th>Activity</Th><Th align="right">Change</Th><Th align="right">Balance</Th></tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const amt = Number(t.amount);
            return (
              <Tr key={t.id}>
                <Td className="whitespace-nowrap text-ink-600">{formatTimestamp(t.created_at)}</Td>
                <Td><span className="font-mono text-xs font-medium text-ink-600">{LEAVE_SHORT[t.leave_type]}</span></Td>
                <Td>
                  <span className="text-ink">{TXN_LABEL[t.kind]}</span>
                  {t.note && <span className="block text-xs text-ink-500">{t.note}</span>}
                </Td>
                <Td align="right" className={amt > 0 ? 'font-medium text-emerald-700' : amt < 0 ? 'font-medium text-red-600' : 'text-ink-400'}>
                  {amt > 0 ? '+' : ''}{days(amt)}
                </Td>
                <Td align="right" className="text-ink-600">{days(t.balance_after)}</Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </TableScroll>
  );
}
