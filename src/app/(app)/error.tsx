'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/** Friendly recovery screen instead of a frozen page when a request fails (e.g. flaky network). */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { console.error(error); }, [error]);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-white p-8 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-zinc-100 text-ink-500"><WifiOff className="h-5 w-5" /></span>
      <h1 className="mt-4 text-base font-semibold text-ink">{offline ? 'You’re offline' : 'That didn’t go through'}</h1>
      <p className="mt-1 text-sm text-ink-500">
        {offline ? 'Check your internet connection, then try again.' : 'The connection dropped or the server was slow. Nothing was lost — try again.'}
      </p>
      <Button className="mt-6" onClick={() => { router.refresh(); reset(); }}>
        <RefreshCw className="h-4 w-4" /> Try again
      </Button>
    </div>
  );
}
