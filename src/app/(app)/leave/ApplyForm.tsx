'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Send, Wallet, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { useActionToast } from '@/components/ui/Toaster';
import { countWorkingDays } from '@/lib/leave-utils';
import { days as fmtDays } from '@/lib/format';
import type { LeaveType } from '@/lib/types';
import { applyLeave } from './actions';

type Option = { value: LeaveType; label: string; available: number };
type Duration = 'full' | 'first' | 'second';

export type ApplyContext = { options: Option[]; weekendDays: number[]; holidays: string[]; today: string };

export function ApplyForm({
  options, weekendDays, holidays, today, onDone,
}: ApplyContext & { onDone?: () => void }) {
  const [state, action, pending] = useActionState(applyLeave, undefined);
  useActionToast(state);
  const [type, setType] = useState<LeaveType>(options[0]?.value ?? 'casual');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [duration, setDuration] = useState<Duration>('full');
  const [reason, setReason] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

  useEffect(() => {
    if (state?.success) { formRef.current?.reset(); setStart(''); setEnd(''); setDuration('full'); setReason(''); onDone?.(); }
  }, [state, onDone]);

  const singleDay = !!start && (!end || end === start);
  const half = singleDay && duration !== 'full';
  useEffect(() => { if (!singleDay) setDuration('full'); }, [singleDay]);

  const working = countWorkingDays(start, end || start, weekendDays, holidaySet);
  const count = half ? (working > 0 ? 0.5 : 0) : working;
  const selected = options.find((o) => o.value === type);
  const available = selected?.available ?? 0;
  const usable = Math.max(available, 0);
  const isWfh = type === 'wfh';
  const isUnpaid = type === 'unpaid';
  const excess = isUnpaid ? 0 : Math.max(0, count - usable);
  const after = available - count;
  // CL / EL can't go negative: anything beyond the balance must be Unpaid leave.
  const overBalance = !isUnpaid && !isWfh && count > 0 && excess > 0;
  const overFloor = isWfh && count > 0 && after < -10;
  const needsRequest = count > 0 && (isUnpaid || (isWfh && excess > 0));
  const blocked = overBalance || overFloor;
  const hasUnpaid = options.some((o) => o.value === 'unpaid');
  const monthEnd = (() => { const [y, m] = today.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); })();

  if (options.length === 0) return <p className="text-sm text-ink-500">No leave types are available to you.</p>;

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <fieldset>
        <legend className="label">Type</legend>
        <div className={`grid gap-2 ${options.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          {options.map((o) => (
            <label key={o.value}
              className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2.5 transition-all has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-brand/20 ${
                type === o.value ? 'border-brand bg-brand-50/60 ring-1 ring-brand' : 'border-line bg-white hover:border-ink-300'}`}>
              <input type="radio" name="leave_type" value={o.value} checked={type === o.value} onChange={() => setType(o.value)} className="sr-only" />
              <span className={`text-sm font-medium ${type === o.value ? 'text-brand-700' : 'text-ink'}`}>{o.label}</span>
              <span className={`text-xs ${o.available < 0 ? 'text-red-600' : 'text-ink-500'}`}>
                {o.value === 'unpaid' ? 'Needs approval' : o.available < 0 ? `${fmtDays(o.available)} (owed)` : `${fmtDays(o.available)} available`}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="start_date" className="label">From</label>
          <input id="start_date" name="start_date" type="date" required className="input"
            min={isWfh ? today : undefined} max={isWfh ? monthEnd : undefined}
            value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd(''); }} />
        </div>
        <div>
          <label htmlFor="end_date" className="label">To <span className="font-normal text-ink-400">(same day if empty)</span></label>
          <input id="end_date" name="end_date" type="date" className="input"
            min={start || (isWfh ? today : undefined)} max={isWfh ? monthEnd : undefined}
            value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      {singleDay && (
        <fieldset>
          <legend className="label">Duration</legend>
          <div className="inline-flex rounded-lg border border-line bg-zinc-50 p-0.5">
            {([['full', 'Full day'], ['first', 'First half'], ['second', 'Second half']] as [Duration, string][]).map(([v, l]) => (
              <label key={v} className={`cursor-pointer rounded-md px-3 py-1.5 text-[13px] transition-colors ${duration === v ? 'bg-white font-medium text-ink shadow-xs ring-1 ring-line' : 'text-ink-500 hover:text-ink'}`}>
                <input type="radio" name="duration" value={v} checked={duration === v} onChange={() => setDuration(v)} className="sr-only" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {!singleDay && <input type="hidden" name="duration" value="full" />}

      <div>
        <label htmlFor="reason" className="label">
          Reason {needsRequest ? <span className="text-red-600">*</span> : <span className="font-normal text-ink-400">(optional)</span>}
        </label>
        <textarea id="reason" name="reason" rows={2} maxLength={500} className="input" value={reason} onChange={(e) => setReason(e.target.value)}
          required={needsRequest} placeholder={isUnpaid ? 'Why do you need unpaid leave?' : needsRequest ? 'Why do you need extra days?' : 'Add a note (optional)'} />
      </div>

      {/* Live summary */}
      {!start ? (
        <div className="rounded-lg bg-zinc-50 px-3.5 py-3 text-[13px] text-ink-500">Pick dates to see how many working days this uses.</div>
      ) : count === 0 ? (
        <div className="flex gap-2.5 rounded-lg bg-red-50 px-3.5 py-3 text-[13px] text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No working days in this range (weekends / holidays).
        </div>
      ) : overFloor ? (
        <div className="flex gap-2.5 rounded-lg bg-red-50 px-3.5 py-3 text-[13px] text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{fmtDays(count)} day{count === 1 ? '' : 's'} is too many</p>
            <p className="mt-0.5">WFH can’t go below −10. You can take at most {fmtDays(Math.max(0, available + 10))} day(s) now.</p>
          </div>
        </div>
      ) : overBalance ? (
        <div className="flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="font-medium">{fmtDays(count)} day{count === 1 ? '' : 's'} · only {fmtDays(usable)} {selected?.label ?? ''} available</p>
            <p className="mt-0.5 text-red-700">
              {selected?.label} can’t go below 0. {usable > 0 ? <>Apply {fmtDays(usable)} day(s) here, and the rest as Unpaid leave.</> : <>Apply as Unpaid leave instead.</>}
            </p>
            {hasUnpaid && (
              <button type="button" onClick={() => setType('unpaid')}
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-100">
                Switch to Unpaid leave <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : isUnpaid ? (
        <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">{fmtDays(count)} unpaid day{count === 1 ? '' : 's'} · needs HR approval</p>
            <p className="mt-0.5 text-amber-800">Salary is deducted for these days. Your leave balances don’t change.</p>
          </div>
        </div>
      ) : needsRequest ? (
        <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">{fmtDays(count)} day{count === 1 ? '' : 's'} · {fmtDays(excess)} more than your balance</p>
            <p className="mt-0.5 text-amber-800">
              This needs HR approval. If approved, your WFH becomes <strong>{fmtDays(after)}</strong> — the shortfall is taken off next month’s WFH.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <p className="font-medium">{fmtDays(count)} day{count === 1 ? '' : 's'} · approved instantly</p>
            <p className="mt-0.5 text-emerald-800">Within your balance — {fmtDays(available - count)} left after this.</p>
          </div>
        </div>
      )}

      <input type="hidden" name="raise" value={needsRequest && isWfh ? '1' : '0'} />
      <FormMessage state={state} />
      <Button type="submit" className="w-full" loading={pending} disabled={!start || count === 0 || blocked || (needsRequest && !reason.trim())}
        variant={needsRequest ? 'secondary' : 'primary'}>
        {!pending && (needsRequest ? <Send className="h-4 w-4" /> : <Zap className="h-4 w-4" />)}
        {isUnpaid ? 'Send to HR for approval' : needsRequest ? 'Raise request to HR' : 'Apply'}
      </Button>
    </form>
  );
}
