'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Check, ChevronDown, Copy, Hand, Loader2, ShieldCheck, X, Zap } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Proposal } from './ActionCard';
import { setAiMode, type AiMode } from './mode';

export type Done = { proposal: Proposal; result: { ok: boolean; message: string; password?: string; link?: string } };

const MODES: { id: AiMode; label: string; short: string; desc: string; icon: typeof Hand }[] = [
  { id: 'manual', label: 'Manual', short: 'Manual', icon: Hand, desc: 'Every change shows a card. Nothing happens until you click Confirm.' },
  { id: 'smart', label: 'Smart auto', short: 'Smart', icon: ShieldCheck, desc: 'Low-risk changes run straight away. Deductions, rejections, cancellations, revokes, deactivations, removing holidays, adding employees and bulk allocations still ask.' },
  { id: 'auto', label: 'Full auto', short: 'Full auto', icon: Zap, desc: 'Every change runs straight away, including adding employees (a password is generated and shown once).' },
];

/** Company-wide setting for how Ask HR AI applies changes. */
export function ModeSwitch({ initial }: { initial: AiMode }) {
  const [mode, setMode] = useState<AiMode>(initial);
  const [open, setOpen] = useState(false);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, []);

  function choose(m: AiMode) {
    if (m === mode) { setOpen(false); return; }
    if (m === 'auto') { setOpen(false); setConfirmAuto(true); return; }
    save(m);
  }
  function save(m: AiMode) {
    setErr('');
    start(async () => {
      const r = await setAiMode(m);
      if (!r.ok) { setErr(r.error ?? 'Could not save'); return; }
      setMode(m); setOpen(false); setConfirmAuto(false);
    });
  }
  const cur = MODES.find((x) => x.id === mode)!;
  const tone = mode === 'auto' ? 'border-amber-300 bg-amber-50 text-amber-900' : mode === 'smart' ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-line bg-white text-ink-600';

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${tone}`}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <cur.icon className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">Changes:</span> {cur.short}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-80 animate-pop-in rounded-xl border border-line bg-white p-1.5 shadow-pop">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="menuitemradio" aria-checked={m.id === mode} onClick={() => choose(m.id)}
              className={`flex w-full gap-2.5 rounded-lg px-3 py-2.5 text-left hover:bg-zinc-50 ${m.id === mode ? 'bg-zinc-50' : ''}`}>
              <m.icon className={`mt-0.5 h-4 w-4 shrink-0 ${m.id === 'auto' ? 'text-amber-600' : m.id === 'smart' ? 'text-sky-600' : 'text-ink-500'}`} />
              <span className="flex-1">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">{m.label}{m.id === mode && <Check className="h-3.5 w-3.5 text-emerald-600" />}</span>
                <span className="mt-0.5 block text-xs leading-snug text-ink-500">{m.desc}</span>
              </span>
            </button>
          ))}
          {err && <p className="px-3 py-1.5 text-xs text-red-600">{err}</p>}
          <p className="border-t border-line px-3 pb-1 pt-2 text-2xs text-ink-400">Applies to all Superadmins. Every change still goes through the app’s normal checks.</p>
        </div>
      )}
      <ConfirmDialog open={confirmAuto} onClose={() => setConfirmAuto(false)} onConfirm={() => save('auto')} loading={pending} danger
        title="Turn on Full auto?" confirmLabel="Turn on Full auto"
        message={<>Ask HR AI will make every change straight away — deductions, rejections, cancellations, deactivations and new employees included — with no confirmation card. If it misunderstands a request, the change still happens. You can switch back at any time.</>} />
    </div>
  );
}

/** Result of a change that ran automatically. */
export function DoneCard({ done }: { done: Done }) {
  const { result } = done;
  const [copied, setCopied] = useState(false);
  if (!result.ok) {
    return (
      <div className="mt-3 flex animate-pop-in items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-500 text-white"><X className="h-3.5 w-3.5" /></span>
        <span>Not done: {result.message}</span>
      </div>
    );
  }
  return (
    <div className="mt-3 animate-pop-in rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
      <div className="flex items-center gap-3">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-3.5 w-3.5" /></span>
        <span className="flex-1">{result.message}</span>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-2xs font-medium text-emerald-700 ring-1 ring-emerald-200">Done automatically</span>
        {result.link && <Link href={result.link} className="font-medium underline">View</Link>}
      </div>
      {result.password && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-200">
          <span className="text-xs text-ink-600">Login password (shown once):</span>
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[13px] text-ink">{result.password}</code>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(result.password!); setCopied(true); }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}
