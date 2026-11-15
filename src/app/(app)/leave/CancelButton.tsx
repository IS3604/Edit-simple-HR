'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { useActionToast } from '@/components/ui/Toaster';
import { cancelRequest } from './actions';

export function CancelButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(cancelRequest, undefined);
  useActionToast(state);
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm('Cancel this request?')) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" loading={pending} className="text-ink-500 hover:text-red-600">Cancel</Button>
    </form>
  );
}
