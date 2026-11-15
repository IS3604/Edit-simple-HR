'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { saveAllocation } from '../actions';
import type { LeaveOverview } from '@/lib/types';

export function AllocationForm({ row }: { row: LeaveOverview }) {
  const [state, action, pending] = useActionState(saveAllocation, undefined);
  const permanentWfh = row.category === 'permanent_wfh';

  const fields = [
    { name: 'casual', label: 'CL / month', value: row.casual_per_month },
    { name: 'earned', label: 'EL / month', value: row.earned_per_month },
    { name: 'wfh', label: 'WFH / month', value: row.wfh_per_month, disabled: permanentWfh },
  ];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={row.employee_id} />
      <div className="grid grid-cols-3 gap-3">
        {fields.map((f) => (
          <div key={f.name}>
            <label htmlFor={`alloc-${f.name}`} className="label">{f.label}</label>
            <input
              id={`alloc-${f.name}`}
              name={f.name}
              type="number"
              inputMode="decimal"
              min={0}
              max={31}
              step={0.5}
              defaultValue={Number(f.value)}
              disabled={f.disabled}
              className="input tabular-nums"
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-500">
        {permanentWfh ? 'Permanent WFH employees don’t use WFH days. ' : ''}
        The first save credits the current month; later changes apply from the next 1st.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Saving…' : 'Save allocation'}</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
