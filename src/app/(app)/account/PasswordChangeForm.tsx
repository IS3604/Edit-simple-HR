'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { useActionToast } from '@/components/ui/Toaster';
import { changePassword } from './actions';

export function PasswordChangeForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  useActionToast(state);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.success) ref.current?.reset(); }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-4">
      {[
        ['current', 'Current password', 'current-password'],
        ['next', 'New password', 'new-password'],
        ['confirm', 'Confirm new password', 'new-password'],
      ].map(([name, label, ac]) => (
        <div key={name}>
          <label htmlFor={name} className="label">{label}</label>
          <input id={name} name={name} type="password" autoComplete={ac} required className="input" />
        </div>
      ))}
      <Button type="submit" loading={pending}>Update password</Button>
      <FormMessage state={state} />
    </form>
  );
}
