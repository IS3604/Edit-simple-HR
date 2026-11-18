'use client';

import { submitForm } from '@/lib/submit-form';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Pencil, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormMessage } from '@/components/ui/FormMessage';
import { useActionToast } from '@/components/ui/Toaster';
import { days as fmtDays } from '@/lib/format';
import { LEAVE_LABEL, type LeaveType } from '@/lib/types';
import { editGrant, revokeGrant } from './actions';

type Grant = { id: string; leave_type: LeaveType; days: number; reason: string; employeeName: string; balance: number };

export function GrantActions({ grant }: { grant: Grant }) {
  const [editOpen, setEditOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [editState, editAction, editing] = useActionState(editGrant, undefined);
  const [revokeState, revokeAction, revoking] = useActionState(revokeGrant, undefined);
  const revokeForm = useRef<HTMLFormElement>(null);
  useActionToast(editState);
  useActionToast(revokeState);
  useEffect(() => { if (editState?.success) setEditOpen(false); }, [editState]);
  useEffect(() => { if (revokeState) setRevokeOpen(false); }, [revokeState]);
  const isDeduction = Number(grant.days) < 0;
  const size = Math.abs(Number(grant.days));
  const unused = Math.min(size, Math.max(0, grant.balance));
  const used = size - unused;
  const label = LEAVE_LABEL[grant.leave_type];

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)} aria-label={`Edit grant for ${grant.employeeName}`} title="Edit grant" className="px-2">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <form ref={revokeForm} action={revokeAction}>
        <input type="hidden" name="id" value={grant.id} />
        <Button type="button" size="sm" variant="ghost" className="px-2 text-ink-500 hover:text-red-600" onClick={() => setRevokeOpen(true)}
          aria-label={`Revoke grant for ${grant.employeeName}`} title="Revoke grant">
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
      </form>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={isDeduction ? 'Edit deduction' : 'Edit grant'}
        description={`${grant.employeeName} · ${label}`} size="sm">
        <form action={editAction} className="space-y-4">
          <input type="hidden" name="id" value={grant.id} />
          <input type="hidden" name="sign" value={isDeduction ? '-' : '+'} />
          <div>
            <label htmlFor={`days-${grant.id}`} className="label">{isDeduction ? 'Days deducted' : 'Days granted'}</label>
            <input id={`days-${grant.id}`} name="days" type="number" min={0.5} max={31} step={0.5} required defaultValue={size} className="input" />
            <p className="hint">The difference is added to or removed from the balance. The balance can’t go below 0.</p>
          </div>
          <div>
            <label htmlFor={`reason-${grant.id}`} className="label">Reason</label>
            <textarea id={`reason-${grant.id}`} name="reason" rows={2} maxLength={500} required defaultValue={grant.reason} className="input" />
          </div>
          <FormMessage state={editState} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit" loading={editing}>Save changes</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={revokeOpen} onClose={() => setRevokeOpen(false)} onConfirm={() => submitForm(revokeForm.current)}
        loading={revoking} danger title={isDeduction ? 'Revoke this deduction?' : 'Revoke this grant?'} confirmLabel="Revoke"
        message={isDeduction ? (
          <>This gives <strong>{fmtDays(size)} {label}</strong> back to {grant.employeeName}.</>
        ) : used > 0 ? (
          <span className="block space-y-2">
            <span className="block">{grant.employeeName} has already used <strong>{fmtDays(used)} of {fmtDays(size)}</strong> days (leave is booked or taken).</span>
            <span className="block">Revoking takes back the <strong>{fmtDays(unused)} unused</strong> day(s) now. Booked leave stays approved — if it’s cancelled later, those days are taken back too. The balance never goes below 0.</span>
          </span>
        ) : (
          <>This removes <strong>{fmtDays(size)} {label}</strong> from {grant.employeeName}’s balance. The grant stays in the history as revoked.</>
        )} />
    </div>
  );
}
