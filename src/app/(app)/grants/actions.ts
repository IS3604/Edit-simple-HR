'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { friendlyDbError } from '@/lib/validation/employee';
import { days as fmtDays } from '@/lib/format';
import type { ActionState, LeaveType } from '@/lib/types';

const validDays = (n: number) => Number.isFinite(n) && n > 0 && n <= 31 && Number.isInteger(n * 2);

function refresh(employeeId?: string) {
  for (const p of ['/grants', '/balances', '/']) revalidatePath(p);
  if (employeeId) revalidatePath(`/employees/${employeeId}`);
}

export async function grantSpecial(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['superadmin']);
  const employeeId = String(fd.get('employee_id') ?? '');
  const type = String(fd.get('leave_type') ?? '') as LeaveType;
  const deduct = fd.get('direction') === 'deduct';
  const daysNum = Number(fd.get('days'));
  const reason = String(fd.get('reason') ?? '').trim();

  if (!employeeId) return { error: 'Choose an employee.' };
  if (!['casual', 'earned', 'wfh'].includes(type)) return { error: 'Choose CL, EL or WFH.' };
  if (!validDays(daysNum)) return { error: 'Days must be between 0.5 and 31, in steps of 0.5.' };
  if (!reason) return { error: 'Add a reason.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('grant_special', { p_emp: employeeId, p_type: type, p_days: deduct ? -daysNum : daysNum, p_reason: reason });
  if (error) return { error: friendlyDbError(error) };
  refresh(employeeId);
  return { success: deduct ? `${fmtDays(daysNum)} day(s) deducted from the balance.` : `${fmtDays(daysNum)} day(s) added to the balance.` };
}

export async function editGrant(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['superadmin']);
  const id = String(fd.get('id') ?? '');
  const deduct = fd.get('sign') === '-';
  const daysNum = Number(fd.get('days'));
  const reason = String(fd.get('reason') ?? '').trim();
  if (!id) return { error: 'Missing grant.' };
  if (!validDays(daysNum)) return { error: 'Days must be between 0.5 and 31, in steps of 0.5.' };
  if (!reason) return { error: 'Add a reason.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('update_special_grant', { p_id: id, p_days: deduct ? -daysNum : daysNum, p_reason: reason });
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { success: deduct ? 'Deduction updated.' : 'Grant updated.' };
}

export async function revokeGrant(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['superadmin']);
  const id = String(fd.get('id') ?? '');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('revoke_special_grant', { p_id: id });
  if (error) return { error: friendlyDbError(error) };
  refresh();
  const r = data as { days: number; taken_back: number; already_used: number; expired: boolean };
  if (Number(r.days) < 0) return { success: `Deduction revoked — ${fmtDays(r.taken_back)} day(s) returned.` };
  if (r.expired) return { success: 'Grant marked revoked (its period had already ended, so nothing to take back).' };
  if (Number(r.already_used) > 0)
    return { success: `Revoked — ${fmtDays(r.taken_back)} day(s) taken back. ${fmtDays(r.already_used)} were already used and stay as approved leave.` };
  return { success: `Revoked — ${fmtDays(r.taken_back)} day(s) taken back.` };
}
