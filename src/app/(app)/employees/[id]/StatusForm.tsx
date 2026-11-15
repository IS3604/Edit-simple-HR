'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormMessage } from '@/components/ui/FormMessage';
import { useActionToast } from '@/components/ui/Toaster';
import { setEmployeeStatus } from '../actions';
import type { EmployeeStatus } from '@/lib/types';

export function StatusForm({ id, status, isSelf }: { id: string; status: EmployeeStatus; isSelf: boolean }) {
  const [state, action, pending] = useActionState(setEmployeeStatus, undefined);
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useActionToast(state);
  useEffect(() => { if (state) setOpen(false); }, [state]);
  const deactivate = status === 'active';

  if (isSelf && deactivate) return <p className="text-[13px] text-ink-500">You can’t deactivate your own account.</p>;

  return (
    <form ref={form} action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={deactivate ? 'inactive' : 'active'} />
      <p className="text-[13px] text-ink-500">
        {deactivate
          ? 'Blocks sign-in, stops monthly credits and cancels pending requests. History is kept.'
          : 'Restores sign-in. Monthly credits resume from the next month.'}
      </p>
      <Button type="button" variant={deactivate ? 'danger' : 'secondary'} loading={pending}
        onClick={() => (deactivate ? setOpen(true) : form.current?.requestSubmit())}>
        {deactivate ? 'Deactivate employee' : 'Reactivate employee'}
      </Button>
      <FormMessage state={state} />
      <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={() => form.current?.requestSubmit()} loading={pending} danger
        title="Deactivate this employee?" confirmLabel="Deactivate"
        message="They will be signed out immediately, pending requests will be cancelled and monthly credits will stop." />
    </form>
  );
}
