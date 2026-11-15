'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toaster';
import { disablePush, enablePush, getPushState, playChime, type PushState } from '@/lib/push-client';
import { sendTestPush } from './push-actions';

const TEXT: Record<PushState, string> = {
  unsupported: 'This browser doesn’t support push notifications. On iPhone, add the portal to your Home Screen first (Share → Add to Home Screen).',
  unconfigured: 'Push isn’t configured on the server yet. Ask your administrator to add the VAPID keys.',
  denied: 'Blocked for this site. Allow notifications from the lock icon in the address bar, then reload.',
  off: 'Off on this device.',
  on: 'On for this device. You’ll hear the EditSimple chime while the portal is open.',
};

export function NotificationSettings({ superadmin }: { superadmin: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getPushState().then(setState).catch(() => setState('unsupported')); }, []);

  const run = async (fn: () => Promise<PushState>) => {
    setBusy(true);
    try {
      const s = await fn(); setState(s);
      if (s === 'on') { playChime(); toast('Notifications turned on.'); }
      if (s === 'off') toast('Notifications turned off.');
      if (s === 'denied') toast('Notifications are blocked in your browser.', 'error');
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">
        {superadmin ? 'You’ll be notified when someone requests extra days.' : 'You’ll be notified when your extra-day requests are decided.'}
      </p>
      <div className="flex items-center gap-2.5 rounded-md bg-zinc-50 px-3 py-2.5 text-[13px] text-ink-600">
        {state === 'on' ? <Bell className="h-4 w-4 text-emerald-600" /> : <BellOff className="h-4 w-4 text-ink-400" />}
        {state ? TEXT[state] : 'Checking…'}
      </div>
      <div className="flex flex-wrap gap-2">
        {state === 'on' ? (
          <>
            <Button variant="secondary" size="sm" loading={busy} onClick={() => run(disablePush)}>Turn off</Button>
            <Button variant="secondary" size="sm" onClick={async () => { const r = await sendTestPush(); if ('error' in r && r.error) toast(r.error, 'error'); }}>Send test notification</Button>
          </>
        ) : (state === 'off') && (
          <Button size="sm" loading={busy} onClick={() => run(enablePush)}>Turn on notifications</Button>
        )}
        <Button variant="ghost" size="sm" onClick={playChime}><Volume2 className="h-4 w-4" /> Preview sound</Button>
      </div>
    </div>
  );
}
