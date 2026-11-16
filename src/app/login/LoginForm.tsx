'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { signIn } from './actions';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState(signIn, initialError ? { error: initialError } : undefined);
  const [show, setShow] = useState(false);
  const router = useRouter();
  const done = Boolean(state?.success);

  useEffect(() => {
    if (!done) return;
    router.prefetch('/');
    const t = setTimeout(() => { router.replace('/'); router.refresh(); }, 1100);
    return () => clearTimeout(t);
  }, [done, router]);

  if (done) {
    return (
      <div className="flex flex-col items-center py-6 text-center" role="status" aria-live="polite">
        <svg className="login-tick h-16 w-16" viewBox="0 0 52 52" aria-hidden>
          <circle className="login-tick-circle" cx="26" cy="26" r="24" fill="none" />
          <path className="login-tick-check" fill="none" d="M15 27.5l7.2 7.2L37.5 19" />
        </svg>
        <p className="mt-4 text-sm font-medium text-ink">Signed in</p>
        <p className="mt-1 text-xs text-ink-500">Taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required autoFocus className="input h-10" placeholder="you@editsimple.in" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <div className="relative">
          <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required className="input h-10 pr-10" />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:text-ink"
            aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <FormMessage state={state} />
      <Button type="submit" loading={pending} className="h-10 w-full">Sign in</Button>
    </form>
  );
}
