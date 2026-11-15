'use client';

import { useActionState } from 'react';
import { decideRequest } from './actions';
import { FormMessage } from '@/components/ui/FormMessage';

export function DecideForm({ id, disabledReason }: { id: string; disabledReason?: string }) {
  const [state, action, pending] = useActionState(decideRequest, undefined);
  if (disabledReason) return <p className="text-xs text-ink-400">{disabledReason}</p>;
  if (state?.success) return <FormMessage state={state} />;

  return (
    <form action={action} className="flex min-w-[220px] flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="note" maxLength={500} placeholder="Note (optional)" className="input py-1.5 text-xs" aria-label="Decision note" />
      <div className="flex gap-2">
        <button type="submit" name="decision" value="approve" disabled={pending}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
          Approve
        </button>
        <button type="submit" name="decision" value="reject" disabled={pending}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium hover:bg-canvas disabled:opacity-50">
          Reject
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
