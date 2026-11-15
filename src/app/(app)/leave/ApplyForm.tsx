'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { countWorkingDays } from '@/lib/leave-utils';
import { days as fmtDays } from '@/lib/format';
import type { LeaveType } from '@/lib/types';
import { applyLeave } from './actions';

type Option = { value: LeaveType; label: string; available: number };

export function ApplyForm({
  options,
  weekendDays,
  holidays,
  today,
}: {
  options: Option[];
  weekendDays: number[];
  holidays: string[];
  today: string;
}) {
  const [state, action, pending] = useActionState(applyLeave, undefined);
  const [type, setType] = useState<LeaveType>(options[0]?.value ?? 'casual');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setStart('');
      setEnd('');
    }
  }, [state]);

  const effectiveEnd = end || start;
  const count = countWorkingDays(start, effectiveEnd, weekendDays, holidaySet);
  const selected = options.find((o) => o.value === type);
  const over = selected ? count > selected.available : false;

  // WFH is limited to the current month.
  const monthEnd = (() => {
    const [y, m] = today.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  })();
  const isWfh = type === 'wfh';

  if (options.length === 0) return <p className="text-sm text-ink-500">No leave types are available to you.</p>;

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div>
        <span className="label">Type</span>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors ${
                type === o.value ? 'border-brand bg-brand-50 text-brand-700' : 'border-line bg-white text-ink-600 hover:bg-canvas'
              }`}
            >
              <input
                type="radio"
                name="leave_type"
                value={o.value}
                checked={type === o.value}
                onChange={() => setType(o.value)}
                className="sr-only"
              />
              {o.label} <span className="text-xs opacity-70">({fmtDays(o.available)} left)</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="start_date" className="label">Start date</label>
          <input id="start_date" name="start_date" type="date" required className="input"
            min={isWfh ? today : undefined} max={isWfh ? monthEnd : undefined}
            value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd(''); }} />
        </div>
        <div>
          <label htmlFor="end_date" className="label">End date</label>
          <input id="end_date" name="end_date" type="date" className="input"
            min={start || (isWfh ? today : undefined)} max={isWfh ? monthEnd : undefined}
            value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <div>
        <label htmlFor="reason" className="label">Reason <span className="font-normal text-ink-400">(optional)</span></label>
        <textarea id="reason" name="reason" rows={2} maxLength={500} className="input" />
      </div>

      {start && (
        <p className={`text-sm ${over || count === 0 ? 'text-red-600' : 'text-ink-600'}`}>
          {count === 0
            ? 'No working days in this range.'
            : `${count} working day${count === 1 ? '' : 's'}${over ? ' — more than your available balance' : ''}`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !start || count === 0 || over}>
          {pending ? 'Submitting…' : 'Submit request'}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
