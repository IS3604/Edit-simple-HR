'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { grantSpecial } from './actions';

export function GrantForm({ employees }: { employees: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(grantSpecial, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.success) ref.current?.reset(); }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-4">
      <div>
        <label htmlFor="employee_id" className="label">Employee</label>
        <select id="employee_id" name="employee_id" required defaultValue="" className="input">
          <option value="" disabled>Select…</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="leave_type" className="label">Grant</label>
          <select id="leave_type" name="leave_type" required className="input">
            <option value="casual">Casual Leave</option>
            <option value="earned">Earned Leave</option>
            <option value="wfh">WFH days (this month)</option>
          </select>
        </div>
        <div>
          <label htmlFor="days" className="label">Days</label>
          <input id="days" name="days" type="number" min={0.5} max={31} step={0.5} required className="input" />
        </div>
      </div>
      <div>
        <label htmlFor="reason" className="label">Reason</label>
        <textarea id="reason" name="reason" rows={2} maxLength={500} required className="input" placeholder="e.g. Marriage leave, compensatory off" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? 'Granting…' : 'Grant'}</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
