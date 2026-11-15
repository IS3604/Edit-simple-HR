'use client';

import { useActionState, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { signIn } from './actions';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState(signIn, initialError ? { error: initialError } : undefined);
  const [show, setShow] = useState(false);

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
