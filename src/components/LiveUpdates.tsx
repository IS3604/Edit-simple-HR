'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/client';

const TABLES = ['leave_requests', 'leave_transactions', 'leave_balances', 'special_grants', 'holidays', 'employees', 'leave_allocations'];

/**
 * Keeps every screen up to date without a manual refresh:
 *  • Supabase Realtime pushes row changes (RLS applies — people only hear about rows they can see);
 *  • the page refreshes when you come back to the tab;
 *  • a light 60-second refresh runs while the tab is visible, as a safety net.
 */
export function LiveUpdates() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const last = useRef(Date.now());

  useEffect(() => {
    const refresh = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // Don't yank the page while someone is typing in a form or a dialog is open.
        const busy = document.activeElement?.matches('input, textarea, select') || document.querySelector('[role="dialog"]');
        if (busy) { timer.current = setTimeout(refresh, 1500); return; }
        last.current = Date.now();
        router.refresh();
      }, 400);
    };

    const supabase = getBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase.channel('es-live');
      for (const table of TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
      }
      channel.subscribe();
    })();

    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - last.current > 15_000) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const poll = setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - last.current > 55_000) refresh(); }, 60_000);

    return () => {
      clearTimeout(timer.current);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
