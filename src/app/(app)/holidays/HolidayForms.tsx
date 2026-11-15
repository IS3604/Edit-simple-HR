'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { useActionToast } from '@/components/ui/Toaster';
import { addHoliday, deleteHoliday, saveWeekend } from './actions';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AddHolidayForm() {
  const [state, action, pending] = useActionState(addHoliday, undefined);
  useActionToast(state);
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
        <Button type="submit" loading={pending}>Add holiday</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteHolidayButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteHoliday, undefined);
  useActionToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" loading={pending} className="text-ink-400 hover:text-red-600">Remove</Button>
    </form>
  );
}

export function WeekendForm({ current }: { current: number[] }) {
  const [state, action, pending] = useActionState(saveWeekend, undefined);
  useActionToast(state);
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {DAY_NAMES.map((d, i) => (
          <label key={d} className="cursor-pointer">
            <input type="checkbox" name="weekend" value={i} defaultChecked={current.includes(i)} className="peer sr-only" />
            <span className="inline-flex h-8 min-w-[44px] items-center justify-center rounded-lg border border-line px-2 text-[13px] text-ink-600 transition-colors peer-checked:border-brand peer-checked:bg-brand-50 peer-checked:font-medium peer-checked:text-brand-700 peer-focus-visible:ring-[3px] peer-focus-visible:ring-brand/25">{d}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" loading={pending}>Save weekend days</Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
