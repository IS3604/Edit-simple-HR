'use client';

import { useActionState } from 'react';
import { signIn } from './actions';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState(signIn, initialError ? { error: initialError } : undefined);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="you@editsimple.com" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
