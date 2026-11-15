'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { playChime, pushSupported, syncPush } from '@/lib/push-client';
import { toast } from '@/components/ui/Toaster';

/** Registers the service worker, keeps the subscription fresh, and plays the chime for live pushes. */
export function NotificationCenter() {
  const router = useRouter();

  useEffect(() => {
    if (!pushSupported()) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => syncPush()).catch(() => {});
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'es-push') return;
      if (document.visibilityState === 'visible') playChime();
      toast([e.data.title, e.data.body].filter(Boolean).join(' — '), 'success');
      router.refresh();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

  return null;
}
