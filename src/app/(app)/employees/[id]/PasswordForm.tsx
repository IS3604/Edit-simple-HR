'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { resetEmployeePassword } from '../actions';

export function PasswordForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resetEmployeePassword, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.success) ref.current?.reset(); }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="new-password" className="label">New password</label>
      <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" placeholder="At least 10 characters" />
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Saving…' : 'Set password'}</Button>
      <FormMessage state={state} />
    </form>
  );
}
