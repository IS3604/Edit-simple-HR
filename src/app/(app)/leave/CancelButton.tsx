'use client';

import { useActionState } from 'react';
import { cancelRequest } from './actions';
import { FormMessage } from '@/components/ui/FormMessage';

export function CancelButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(cancelRequest, undefined);
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm('Cancel this request?')) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="text-xs font-medium text-ink-500 hover:text-red-600 disabled:opacity-50">
        {pending ? 'Cancelling…' : 'Cancel'}
      </button>
      {state?.error && <FormMessage state={state} />}
    </form>
  );
}
