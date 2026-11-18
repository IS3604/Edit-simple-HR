'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { useActionToast } from '@/components/ui/Toaster';
import { days as fmtDays } from '@/lib/format';
import { grantSpecial } from './actions';

export type GrantEmployee = { id: string; label: string; casual: number; earned: number; wfh: number; permanentWfh: boolean };
type Kind = 'casual' | 'earned' | 'wfh';
const KIND_LABEL: Record<Kind, string> = { casual: 'CL', earned: 'EL', wfh: 'WFH' };

export function GrantForm({ employees }: { employees: GrantEmployee[] }) {
  const [state, action, pending] = useActionState(grantSpecial, undefined);
  useActionToast(state);
  const ref = useRef<HTMLFormElement>(null);
  const [direction, setDirection] = useState<'add' | 'deduct'>('add');
  const [empId, setEmpId] = useState('');
  const [kind, setKind] = useState<Kind>('casual');
  const [amount, setAmount] = useState('');
  useEffect(() => { if (state?.success) { ref.current?.reset(); setAmount(''); } }, [state]);

  const emp = employees.find((e) => e.id === empId);
  const kinds: Kind[] = emp?.permanentWfh ? ['casual', 'earned'] : ['casual', 'earned', 'wfh'];
  useEffect(() => { if (!kinds.includes(kind)) setKind('casual'); }, [kinds, kind]);
  const current = emp ? emp[kind] : null;
  const n = Number(amount) || 0;
  const after = current === null ? null : direction === 'add' ? current + n : current - n;
  const tooMuch = direction === 'deduct' && after !== null && after < 0;
  const deduct = direction === 'deduct';

  return (
    <form ref={ref} action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1">
        {(['add', 'deduct'] as const).map((d) => (
          <label key={d} className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] font-medium transition-all ${
            direction === d ? (d === 'add' ? 'bg-white text-emerald-700 shadow-xs ring-1 ring-emerald-200' : 'bg-white text-red-700 shadow-xs ring-1 ring-red-200') : 'text-ink-500 hover:text-ink'}`}>
            <input type="radio" name="direction" value={d} checked={direction === d} onChange={() => setDirection(d)} className="sr-only" />
            {d === 'add' ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
            {d === 'add' ? 'Add days' : 'Deduct days'}
          </label>
        ))}
      </div>

      <div>
        <label htmlFor="employee_id" className="label">Employee</label>
        <select id="employee_id" name="employee_id" required value={empId} onChange={(e) => setEmpId(e.target.value)} className="input">
          <option value="" disabled>Select…</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        {emp && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {kinds.map((k) => (
              <span key={k} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-ink-600">
                {KIND_LABEL[k]} <strong className={`font-semibold ${emp[k] < 0 ? 'text-red-600' : 'text-ink'}`}>{fmtDays(emp[k])}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="leave_type" className="label">Type</label>
          <select id="leave_type" name="leave_type" required className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="casual">Casual Leave</option>
            <option value="earned">Earned Leave</option>
            {kinds.includes('wfh') && <option value="wfh">WFH (this month)</option>}
          </select>
        </div>
        <div>
          <label htmlFor="days" className="label">Days</label>
          <input id="days" name="days" type="number" min={0.5} max={31} step={0.5} required className="input"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>

      {emp && n > 0 && after !== null && (
        <p className={`rounded-lg px-3 py-2 text-[13px] ${tooMuch ? 'bg-red-50 text-red-700' : deduct ? 'bg-red-50/60 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
          {tooMuch
            ? <>Only {fmtDays(current ?? 0)} {KIND_LABEL[kind]} available — can’t deduct {fmtDays(n)}.</>
            : <>{KIND_LABEL[kind]} balance: {fmtDays(current ?? 0)} → <strong>{fmtDays(after)}</strong></>}
        </p>
      )}

      <div>
        <label htmlFor="reason" className="label">Reason</label>
        <textarea id="reason" name="reason" rows={2} maxLength={500} required className="input"
          placeholder={deduct ? 'e.g. Unapproved absence, correction' : 'e.g. Marriage leave, compensatory off'} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} disabled={tooMuch} variant={deduct ? 'danger' : 'primary'}>
          {deduct ? 'Deduct days' : 'Add days'}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
