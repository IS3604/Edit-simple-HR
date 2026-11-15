'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useActionToast } from '@/components/ui/Toaster';
import { decideRequest } from './actions';

/**
 * Approve = one click. Reject = asks for an optional note.
 * Each decision is its own <form> with a hidden "decision" field, so the value
 * never depends on which submit button the browser reports.
 */
export function DecideForm({ id, disabledReason }: { id: string; disabledReason?: string }) {
  const [state, action, pending] = useActionState(decideRequest, undefined);
  const [rejecting, setRejecting] = useState(false);
  const noteRef = useRef<HTMLInputElement>(null);
  useActionToast(state);
  useEffect(() => { if (rejecting) noteRef.current?.focus(); }, [rejecting]);

  if (disabledReason) return <span className="text-xs text-ink-400">{disabledReason}</span>;
  if (state?.success) return <Badge tone={state.success === 'Approved' ? 'success' : 'danger'}>{state.success}</Badge>;

  if (rejecting) {
    return (
      <form action={action} className="ml-auto flex w-full max-w-[280px] items-center gap-1.5">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="reject" />
        <input ref={noteRef} name="note" maxLength={500} placeholder="Reason (optional)" aria-label="Rejection note"
          className="input h-8 min-w-0 flex-1 text-[13px]" />
        <Button type="submit" size="sm" variant="danger" loading={pending}>Reject</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={pending} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="approve" />
        <Button type="submit" size="sm" variant="success" loading={pending}>
          {!pending && <Check className="h-3.5 w-3.5" aria-hidden />} Approve
        </Button>
      </form>
      <Button type="button" size="sm" variant="secondary" onClick={() => setRejecting(true)} disabled={pending}>
        Reject
      </Button>
    </div>
  );
}
