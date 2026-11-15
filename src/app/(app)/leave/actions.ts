'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { friendlyDbError } from '@/lib/validation/employee';
import type { ActionState, LeaveType } from '@/lib/types';

const TYPES: LeaveType[] = ['casual', 'earned', 'wfh'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function applyLeave(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile();
  const type = String(fd.get('leave_type') ?? '') as LeaveType;
  const start = String(fd.get('start_date') ?? '');
  const end = String(fd.get('end_date') ?? '') || start;
  const reason = String(fd.get('reason') ?? '').trim();

  if (!TYPES.includes(type)) return { error: 'Choose a leave type.' };
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) return { error: 'Choose valid dates.' };
  if (reason.length > 500) return { error: 'Reason must be under 500 characters.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('apply_leave', { p_type: type, p_start: start, p_end: end, p_reason: reason });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath('/leave');
  revalidatePath('/');
  return { success: 'Request submitted for approval.' };
}

export async function cancelRequest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile();
  const id = String(fd.get('id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_request', { p_id: id });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath('/leave');
  revalidatePath('/');
  return { success: 'Cancelled.' };
}
