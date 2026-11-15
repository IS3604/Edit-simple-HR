'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { setEmployeeStatus } from '../actions';
import type { EmployeeStatus } from '@/lib/types';

export function StatusForm({ id, status, isSelf }: { id: string; status: EmployeeStatus; isSelf: boolean }) {
  const [state, action, pending] = useActionState(setEmployeeStatus, undefined);
  const deactivate = status === 'active';

  if (isSelf && deactivate) {
    return <p className="text-sm text-ink-500">You can’t deactivate your own account.</p>;
  }

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (deactivate && !window.confirm('Deactivate this employee? They will be signed out and pending requests cancelled.')) {
          e.preventDefault();
        }
      }}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={deactivate ? 'inactive' : 'active'} />
      <p className="text-sm text-ink-600">
        {deactivate
          ? 'Blocks sign-in, stops monthly credits and cancels pending requests. History is kept.'
          : 'Restores sign-in. Monthly credits resume from the next month.'}
      </p>
      <Button type="submit" variant="secondary" disabled={pending} className={deactivate ? 'text-red-600' : ''}>
        {pending ? 'Saving…' : deactivate ? 'Deactivate employee' : 'Reactivate employee'}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
