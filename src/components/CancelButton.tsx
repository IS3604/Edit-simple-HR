'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { useActionToast } from '@/components/ui/Toaster';
import { cancelRequest } from '@/app/(app)/leave/actions';

export function CancelButton({ id, approved = false }: { id: string; approved?: boolean }) {
  const [state, action, pending] = useActionState(cancelRequest, undefined);
  useActionToast(state);
  if (state?.success) return <span className="text-xs text-ink-400">Cancelled</span>;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const msg = approved
          ? 'Cancel this approved leave? The deducted days will be returned to the balance.'
          : 'Cancel this request?';
        if (!window.confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" loading={pending} className="text-ink-500 hover:text-red-600">
        {approved ? 'Cancel leave' : 'Cancel'}
      </Button>
    </form>
  );
}
