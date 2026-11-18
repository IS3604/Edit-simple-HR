'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { AlertTriangle, CalendarPlus, CalendarX, Check, CircleSlash, Gift, KeyRound, Loader2, Minus, Pencil, Plus, ThumbsDown, ThumbsUp, Undo2, UserCog, UserPlus, X } from 'lucide-react';
import { CATEGORY_LABEL, ROLE_LABEL, type EmployeeCategory, type Role } from '@/lib/types';
import { createEmployeeFromChat } from '../employees/actions';
import { executeProposal } from './execute';
import { days as fmtDays } from '@/lib/format';

export type Proposal = { kind: string; fields: Record<string, unknown> };

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  const buf = new Uint32Array(14);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}

/** Picks the right confirmation card for a proposal. */
export function ActionCard({ proposal }: { proposal: Proposal }) {
  return proposal.kind === 'add_employee' ? <AddEmployeeCard proposal={proposal} /> : <ChangeCard proposal={proposal} />;
}

/** The AI's proposal, editable. Nothing is saved until the Superadmin clicks Confirm. */
function AddEmployeeCard({ proposal }: { proposal: Proposal }) {
  const [f, setF] = useState<Record<string, string>>(Object.fromEntries(Object.entries(proposal.fields).map(([k, v]) => [k, String(v ?? '')])));
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [state, setState] = useState<'open' | 'done' | 'cancelled'>('open');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ id: string; name: string; code: string; linked?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  if (state === 'cancelled') {
    return <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs text-ink-500"><X className="h-3.5 w-3.5" /> Cancelled — nothing was saved.</p>;
  }
  if (state === 'done' && result) {
    return (
      <div className="mt-3 flex animate-pop-in items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-4 w-4" /></span>
        <span className="flex-1">
          <strong className="font-semibold">{result.name}</strong> ({result.code}) added{result.linked ? ' and linked to their existing login' : ''}.
        </span>
        <Link href={`/employees/${result.id}`} className="font-medium text-emerald-800 underline">View profile</Link>
      </div>
    );
  }

  function confirm() {
    setError('');
    const fd = new FormData();
    for (const [k, v] of Object.entries(f)) fd.set(k, v);
    fd.set('password', password);
    start(async () => {
      const r = await createEmployeeFromChat(fd);
      if (r.error || !r.id) { setError(r.error ?? 'Could not add the employee.'); return; }
      setResult({ id: r.id, name: r.name ?? f.full_name, code: r.code ?? f.employee_code, linked: r.linked });
      setState('done');
    });
  }

  const input = 'input h-9 text-[13px]';
  return (
    <div className="mt-3 animate-pop-in overflow-hidden rounded-xl border border-brand-200 bg-white shadow-card">
      <div className="flex items-center gap-2 border-b border-line bg-gradient-to-r from-brand-50 to-white px-4 py-2.5">
        <UserPlus className="h-4 w-4 text-brand" />
        <p className="text-[13px] font-semibold text-ink">Add employee — review and confirm</p>
        <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-800 ring-1 ring-amber-200">Not saved yet</span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <label className="text-xs font-medium text-ink-600">Full name<input className={input} value={f.full_name ?? ''} onChange={set('full_name')} /></label>
        <label className="text-xs font-medium text-ink-600">Work email<input type="email" className={input} value={f.email ?? ''} onChange={set('email')} /></label>
        <label className="text-xs font-medium text-ink-600">Employee ID<input className={input} value={f.employee_code ?? ''} onChange={set('employee_code')} /></label>
        <label className="text-xs font-medium text-ink-600">Joining date<input type="date" className={input} value={f.joining_date ?? ''} onChange={set('joining_date')} /></label>
        <label className="text-xs font-medium text-ink-600">Department<input className={input} value={f.department ?? ''} onChange={set('department')} /></label>
        <label className="text-xs font-medium text-ink-600">Designation<input className={input} value={f.designation ?? ''} onChange={set('designation')} /></label>
        <label className="text-xs font-medium text-ink-600">Category
          <select className={input} value={f.category} onChange={set('category')}>
            {(['office', 'permanent_wfh'] as EmployeeCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-600">App role
          <select className={input} value={f.role} onChange={set('role')}>
            {(['employee', 'admin', 'superadmin'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <div className="sm:col-span-2">
          <label htmlFor="ai-pw" className="text-xs font-medium text-ink-600">Login password <span className="font-normal text-ink-400">(set here — never sent to the AI)</span></label>
          <div className="mt-1 flex gap-2">
            <input id="ai-pw" type={showPw ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={72} className="input h-9 flex-1 font-mono text-[13px]"
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" />
            <button type="button" onClick={() => { setPassword(generatePassword()); setShowPw(true); }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-xs font-medium text-ink hover:bg-zinc-50">
              <KeyRound className="h-3.5 w-3.5" /> Generate
            </button>
          </div>
          <p className="mt-1 text-2xs text-ink-500">Share it with the employee privately. Not needed if this email already has a login.</p>
        </div>
      </div>
      {error && <p className="mx-4 mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-line bg-[#FBF9F6] px-4 py-3">
        <button type="button" onClick={() => setState('cancelled')} disabled={pending}
          className="h-9 rounded-md border border-line bg-white px-3.5 text-sm font-medium text-ink-600 hover:bg-zinc-50">Cancel</button>
        <button type="button" onClick={confirm} disabled={pending || !f.full_name || !f.email}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-white shadow-xs hover:bg-brand-600 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm & add
        </button>
      </div>
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  full_name: 'Name', employee_code: 'Employee ID', department: 'Department', designation: 'Designation', joining_date: 'Joining date', category: 'Category',
};
const fmtD = (d: unknown) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : String(d ?? ''));
const range = (f: Record<string, unknown>) => (f.start_date === f.end_date ? fmtD(f.start_date) : `${fmtD(f.start_date)} – ${fmtD(f.end_date)}`);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-[13px]">
      <span className="text-ink-500">{label}</span>
      <span className="text-right font-medium text-ink">{children}</span>
    </div>
  );
}

/** Confirmation card for every change other than adding an employee. */
function ChangeCard({ proposal }: { proposal: Proposal }) {
  const [f, setF] = useState<Record<string, unknown>>({ ...proposal.fields });
  const [state, setState] = useState<'open' | 'done' | 'cancelled'>('open');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const k = proposal.kind;
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [key]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }));

  if (state === 'cancelled') return <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs text-ink-500"><X className="h-3.5 w-3.5" /> Cancelled — nothing was changed.</p>;
  if (state === 'done') {
    return (
      <div className="mt-3 flex animate-pop-in items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-4 w-4" /></span>
        <span className="flex-1">{msg}</span>
      </div>
    );
  }

  const days = Number(f.days ?? 0), cur = Number(f.current ?? 0);
  const deduct = f.direction === 'deduct';
  const after = deduct ? cur - days : cur + days;
  const approve = f.decision !== 'reject';
  const needsReason = (k === 'balance_change' || k === 'edit_grant') && !String(f.reason ?? '').trim();
  const badDays = (k === 'balance_change' && (!(days > 0 && days <= 31) || (deduct && after < 0)))
    || (k === 'edit_grant' && !(Number(f.new_days) > 0 && Number(f.new_days) <= 31));

  const meta: Record<string, { title: string; icon: typeof Check; danger?: boolean; confirm: string }> = {
    balance_change: { title: deduct ? 'Deduct days' : 'Add days', icon: deduct ? Minus : Plus, danger: deduct, confirm: deduct ? 'Confirm deduction' : 'Confirm & add' },
    decide_request: { title: approve ? 'Approve request' : 'Reject request', icon: approve ? ThumbsUp : ThumbsDown, danger: !approve, confirm: approve ? 'Approve' : 'Reject' },
    cancel_request: { title: 'Cancel request', icon: CircleSlash, danger: true, confirm: 'Cancel this request' },
    revoke_grant: { title: Number(f.days) < 0 ? 'Revoke deduction' : 'Revoke grant', icon: Undo2, danger: true, confirm: 'Revoke' },
    edit_grant: { title: Number(f.days) < 0 ? 'Edit deduction' : 'Edit grant', icon: Gift, confirm: 'Save change' },
    edit_employee: { title: 'Edit employee', icon: Pencil, confirm: 'Save changes' },
    set_status: { title: f.status === 'inactive' ? 'Deactivate employee' : 'Reactivate employee', icon: UserCog, danger: f.status === 'inactive', confirm: f.status === 'inactive' ? 'Deactivate' : 'Reactivate' },
    set_allocation: { title: 'Set monthly allocation', icon: Gift, confirm: 'Save allocation' },
    add_holiday: { title: 'Add holiday', icon: CalendarPlus, confirm: 'Add holiday' },
    remove_holiday: { title: 'Remove holiday', icon: CalendarX, danger: true, confirm: 'Remove holiday' },
  };
  const m = meta[k] ?? { title: 'Confirm change', icon: Check, confirm: 'Confirm' };
  const Icon = m.icon;

  function confirm() {
    setError('');
    start(async () => {
      const r = await executeProposal(k, f);
      if (!r.ok) { setError(r.message); return; }
      setMsg(r.message); setState('done');
    });
  }

  const input = 'input h-9 text-[13px]';
  return (
    <div className={`mt-3 animate-pop-in overflow-hidden rounded-xl border bg-white shadow-card ${m.danger ? 'border-red-200' : 'border-brand-200'}`}>
      <div className={`flex items-center gap-2 border-b border-line px-4 py-2.5 ${m.danger ? 'bg-gradient-to-r from-red-50 to-white' : 'bg-gradient-to-r from-brand-50 to-white'}`}>
        <Icon className={`h-4 w-4 ${m.danger ? 'text-red-600' : 'text-brand'}`} />
        <p className="text-[13px] font-semibold text-ink">{m.title} — review and confirm</p>
        <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-800 ring-1 ring-amber-200">Not done yet</span>
      </div>

      <div className="divide-y divide-line px-4 py-2">
        {k === 'balance_change' && (<>
          <Row label="Employee">{String(f.employee)}</Row>
          <Row label="Type">{String(f.type_label)}</Row>
          <div className="grid gap-3 py-2 sm:grid-cols-[120px_1fr]">
            <label className="text-xs font-medium text-ink-600">Days to {deduct ? 'deduct' : 'add'}<input type="number" min={0.5} max={31} step={0.5} className={input} value={days} onChange={set('days')} /></label>
            <label className="text-xs font-medium text-ink-600">Reason<input className={input} value={String(f.reason ?? '')} onChange={set('reason')} placeholder="Required" maxLength={500} /></label>
          </div>
          <Row label="Balance">{fmtDays(cur)} → <span className={after < 0 ? 'text-red-600' : deduct ? 'text-red-700' : 'text-emerald-700'}>{fmtDays(after)}</span></Row>
        </>)}

        {(k === 'decide_request' || k === 'cancel_request') && (<>
          <Row label="Employee">{String(f.employee)}</Row>
          <Row label="Request">{String(f.type_label)} · {range(f)} · {fmtDays(Number(f.days))} day{Number(f.days) === 1 ? '' : 's'}{f.half_day ? ' (half day)' : ''}</Row>
          {String(f.reason ?? '') && <Row label="Their reason"><span className="font-normal italic text-ink-600">“{String(f.reason)}”</span></Row>}
          {k === 'cancel_request' && <Row label="Status">{String(f.status)}{f.status === 'approved' && f.leave_type !== 'unpaid' ? ' — days will be refunded' : ''}</Row>}
          {k === 'decide_request' && (
            <div className="flex flex-wrap items-end gap-3 py-2">
              <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-xs font-medium">
                <button type="button" onClick={() => setF((p) => ({ ...p, decision: 'approve' }))} className={`rounded-md px-3 py-1.5 ${approve ? 'bg-white text-emerald-700 shadow-xs' : 'text-ink-500'}`}>Approve</button>
                <button type="button" onClick={() => setF((p) => ({ ...p, decision: 'reject' }))} className={`rounded-md px-3 py-1.5 ${!approve ? 'bg-white text-red-700 shadow-xs' : 'text-ink-500'}`}>Reject</button>
              </div>
              <label className="min-w-[200px] flex-1 text-xs font-medium text-ink-600">Note to employee (optional)<input className={input} value={String(f.note ?? '')} onChange={set('note')} maxLength={500} /></label>
            </div>
          )}
          {k === 'decide_request' && approve && String(f.warning ?? '') && (
            <p className="flex items-start gap-1.5 py-2 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{String(f.warning)}</p>
          )}
        </>)}

        {(k === 'revoke_grant' || k === 'edit_grant') && (<>
          <Row label="Employee">{String(f.employee)}</Row>
          <Row label={Number(f.days) < 0 ? 'Deduction' : 'Grant'}>{Number(f.days) < 0 ? '−' : '+'}{fmtDays(Math.abs(Number(f.days)))} {String(f.type_label)}</Row>
          {k === 'revoke_grant' && (Number(f.days) > 0
            ? <Row label="Will take back">{fmtDays(Number(f.unused))} unused{Number(f.used) > 0 ? ` · ${fmtDays(Number(f.used))} already used stay` : ''}</Row>
            : <Row label="Will return">{fmtDays(Math.abs(Number(f.days)))} day(s)</Row>)}
          {k === 'edit_grant' && (
            <div className="grid gap-3 py-2 sm:grid-cols-[120px_1fr]">
              <label className="text-xs font-medium text-ink-600">New days<input type="number" min={0.5} max={31} step={0.5} className={input} value={Number(f.new_days)} onChange={set('new_days')} /></label>
              <label className="text-xs font-medium text-ink-600">Reason<input className={input} value={String(f.reason ?? '')} onChange={set('reason')} maxLength={500} /></label>
            </div>
          )}
        </>)}

        {k === 'edit_employee' && (<>
          <Row label="Employee">{String(f.employee)}</Row>
          {((f.changes as { field: string; from: string; to: string }[]) ?? []).map((c) => (
            <Row key={c.field} label={FIELD_LABEL[c.field] ?? c.field}>
              <span className="font-normal text-ink-400 line-through">{c.field === 'category' ? (CATEGORY_LABEL[c.from as EmployeeCategory] ?? c.from) : c.from || '—'}</span>{' → '}
              {c.field === 'category' ? CATEGORY_LABEL[c.to as EmployeeCategory] : c.to || '—'}
            </Row>
          ))}
        </>)}

        {k === 'set_status' && (<>
          <Row label="Employee">{String(f.employee)}</Row>
          <Row label="Change">{f.status === 'inactive' ? 'Deactivate — sign-in blocked, monthly credits stop' : 'Reactivate — sign-in allowed again'}</Row>
        </>)}

        {k === 'set_allocation' && (<>
          <div className="grid grid-cols-3 gap-3 py-2">
            {(['casual', 'earned', 'wfh'] as const).map((t) => (
              <label key={t} className="text-xs font-medium text-ink-600">{t === 'casual' ? 'CL / month' : t === 'earned' ? 'EL / month' : 'WFH / month'}
                <input type="number" min={0} max={31} step={0.5} className={input} value={Number(f[t])} onChange={set(t)} />
              </label>
            ))}
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {((f.rows as { employee: string; current: string; permanent_wfh: boolean }[]) ?? []).map((r) => (
              <Row key={r.employee} label={r.employee}>
                <span className="font-normal text-ink-400">{r.current}</span>{' → '}
                {fmtDays(Number(f.casual))} / {fmtDays(Number(f.earned))} / {r.permanent_wfh ? '0 (Permanent WFH)' : fmtDays(Number(f.wfh))}
              </Row>
            ))}
          </div>
          <p className="py-2 text-2xs text-ink-500">CL / EL / WFH per month. If this month hasn’t been credited yet, it’s credited right away.</p>
        </>)}

        {(k === 'add_holiday' || k === 'remove_holiday') && (<>
          <Row label="Date">{fmtD(f.date)}</Row>
          <Row label="Holiday">{String(f.name)}</Row>
        </>)}
      </div>

      {error && <p className="mx-4 mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-line bg-[#FBF9F6] px-4 py-3">
        <button type="button" onClick={() => setState('cancelled')} disabled={pending}
          className="h-9 rounded-md border border-line bg-white px-3.5 text-sm font-medium text-ink-600 hover:bg-zinc-50">Cancel</button>
        <button type="button" onClick={confirm} disabled={pending || needsReason || badDays}
          className={`inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-white shadow-xs disabled:opacity-50 ${m.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand hover:bg-brand-600'}`}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {m.confirm}
        </button>
      </div>
    </div>
  );
}
