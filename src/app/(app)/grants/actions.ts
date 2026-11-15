'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { friendlyDbError } from '@/lib/validation/employee';
import type { ActionState, LeaveType } from '@/lib/types';

export async function grantSpecial(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['superadmin']);
  const employeeId = String(fd.get('employee_id') ?? '');
  const type = String(fd.get('leave_type') ?? '') as LeaveType;
  const daysNum = Number(fd.get('days'));
  const reason = String(fd.get('reason') ?? '').trim();

  if (!employeeId) return { error: 'Choose an employee.' };
  if (!['casual', 'earned', 'wfh'].includes(type)) return { error: 'Choose what to grant.' };
  if (!Number.isFinite(daysNum) || daysNum <= 0 || daysNum > 31 || !Number.isInteger(daysNum * 2))
    return { error: 'Days must be between 0.5 and 31, in steps of 0.5.' };
  if (!reason) return { error: 'Add a reason for the grant.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('grant_special', { p_emp: employeeId, p_type: type, p_days: daysNum, p_reason: reason });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath('/grants');
  revalidatePath('/balances');
  revalidatePath(`/employees/${employeeId}`);
  return { success: 'Grant recorded and added to the balance.' };
}
