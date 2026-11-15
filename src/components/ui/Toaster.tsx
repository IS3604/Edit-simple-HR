'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import type { ActionState } from '@/lib/types';

type Toast = { id: number; type: 'success' | 'error'; message: string };
const EVENT = 'es-toast';

export function toast(message: string, type: Toast['type'] = 'success') {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, type } }));
}

/** Shows a toast whenever a server action returns a new state. */
export function useActionToast(state: ActionState) {
  const last = useRef<ActionState>(undefined);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.error) toast(state.error, 'error');
    else if (state.success) toast(state.success, 'success');
  }, [state]);
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail;
      const id = ++n;
      setToasts((t) => [...t.slice(-3), { id, message, type }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'}
          className="animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm shadow-pop">
          {t.type === 'success'
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />}
          <p className="flex-1 text-ink-700">{t.message}</p>
          <button type="button" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            className="text-ink-400 hover:text-ink" aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
