'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { friendlyDbError } from '@/lib/validation/employee';
import { notifyRequest } from '@/lib/email';
import { days as fmtDays } from '@/lib/format';
import type { ActionState, LeaveType } from '@/lib/types';

const TYPES: LeaveType[] = ['casual', 'earned', 'wfh'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function refresh() {
  for (const p of ['/', '/leave', '/requests', '/balances', '/calendar']) revalidatePath(p);
}

export async function applyLeave(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['employee']);
  const type = String(fd.get('leave_type') ?? '') as LeaveType;
  const duration = String(fd.get('duration') ?? 'full'); // full | first | second
  const start = String(fd.get('start_date') ?? '');
  const halfDay = duration === 'first' || duration === 'second';
  const end = halfDay ? start : String(fd.get('end_date') ?? '') || start;
  const reason = String(fd.get('reason') ?? '').trim();
  const raise = fd.get('raise') === '1';

  if (!TYPES.includes(type)) return { error: 'Choose a leave type.' };
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) return { error: 'Choose valid dates.' };
  if (reason.length > 500) return { error: 'Reason must be under 500 characters.' };
  if (raise && !reason) return { error: 'Add a reason for the extra days.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('apply_leave', {
    p_type: type, p_start: start, p_end: end, p_reason: reason,
    p_half_day: halfDay, p_session: halfDay ? duration : null, p_raise: raise,
  });
  if (error) return { error: friendlyDbError(error) };

  const result = data as { id: string; status: 'approved' | 'pending'; days: number };
  after(() => notifyRequest(result.id, result.status === 'approved' ? 'auto_approved' : 'extra_requested'));
  refresh();
  return {
    success: result.status === 'approved'
      ? `Approved — ${fmtDays(result.days)} day${Number(result.days) === 1 ? '' : 's'} deducted from your balance.`
      : 'Request sent to HR for approval.',
  };
}

export async function cancelRequest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile();
  const id = String(fd.get('id') ?? '');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cancel_request', { p_id: id });
  if (error) return { error: friendlyDbError(error) };

  const res = data as { refunded: number; was: string };
  if (res.was === 'approved') after(() => notifyRequest(id, 'cancelled', Number(res.refunded)));
  refresh();
  return {
    success: Number(res.refunded) > 0
      ? `Cancelled — ${fmtDays(res.refunded)} day(s) returned to the balance.`
      : 'Request cancelled.',
  };
}
