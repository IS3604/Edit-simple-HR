'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { addHoliday, deleteHoliday, saveWeekend } from './actions';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AddHolidayForm() {
  const [state, action, pending] = useActionState(addHoliday, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.success) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="holiday_date" className="label">Date</label>
          <input id="holiday_date" name="holiday_date" type="date" required className="input" />
        </div>
        <div>
          <label htmlFor="hname" className="label">Name</label>
          <input id="hname" name="name" required maxLength={80} className="input" placeholder="Diwali" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add holiday'}</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteHolidayButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteHoliday, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="text-xs text-ink-500 hover:text-red-600 disabled:opacity-50">
        {pending ? '…' : 'Remove'}
      </button>
      {state?.error && <FormMessage state={state} />}
    </form>
  );
}

export function WeekendForm({ current }: { current: number[] }) {
  const [state, action, pending] = useActionState(saveWeekend, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {DAY_NAMES.map((d, i) => (
          <label key={d} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm">
            <input type="checkbox" name="weekend" value={i} defaultChecked={current.includes(i)} className="accent-brand" />
            {d}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Saving…' : 'Save weekend days'}</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
