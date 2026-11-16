'use client';

import { submitForm } from '@/lib/submit-form';
import { useActionState, useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useActionToast } from '@/components/ui/Toaster';
import { cancelRequest } from '@/app/(app)/leave/actions';

export function CancelButton({ id, approved = false }: { id: string; approved?: boolean }) {
  const [state, action, pending] = useActionState(cancelRequest, undefined);
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useActionToast(state);
  useEffect(() => { if (state) setOpen(false); }, [state]);

  if (state?.success) return <span className="text-xs text-ink-400">Cancelled</span>;
  return (
    <form ref={form} action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)} className="text-ink-500 hover:text-red-600">
        {approved ? 'Cancel leave' : 'Cancel'}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => submitForm(form.current)}
        loading={pending}
        danger
        title={approved ? 'Cancel approved leave?' : 'Cancel this request?'}
        message={approved ? 'The deducted days will be returned to the balance.' : 'It will be withdrawn and nobody will need to act on it.'}
        confirmLabel={approved ? 'Cancel leave' : 'Cancel request'}
      />
    </form>
  );
}
