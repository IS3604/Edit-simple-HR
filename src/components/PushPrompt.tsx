'use client';

import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toaster';
import { enablePush, getPushState, playChime, type PushState } from '@/lib/push-client';

const KEY = 'es-push-prompt-dismissed';

/** Inline prompt to turn on push notifications (hidden once on, dismissed, or unsupported). */
export function PushPrompt({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(KEY) === '1'); } catch { setDismissed(false); }
    getPushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  if (dismissed || !state || state === 'on' || state === 'unsupported' || state === 'unconfigured') return null;

  const dismiss = () => { try { localStorage.setItem(KEY, '1'); } catch {} setDismissed(true); };
  const enable = async () => {
    setBusy(true);
    try {
      const s = await enablePush();
      setState(s);
      if (s === 'on') { playChime(); toast('Notifications are on.'); }
      else if (s === 'denied') toast('Notifications are blocked in your browser settings.', 'error');
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-4 py-3">
      <BellRing className="h-4 w-4 shrink-0 text-brand" aria-hidden />
      <p className="min-w-[200px] flex-1 text-sm text-ink-700">
        {state === 'denied'
          ? 'Notifications are blocked for this site. Allow them from the lock icon in your address bar.'
          : compact
            ? 'Get notified when your extra-day requests are decided.'
            : 'Get an instant notification (with sound) when someone requests extra days.'}
      </p>
      {state !== 'denied' && <Button size="sm" onClick={enable} loading={busy}>Turn on</Button>}
      <button type="button" onClick={dismiss} className="grid h-7 w-7 place-items-center rounded-md text-ink-400 hover:bg-zinc-100 hover:text-ink" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
