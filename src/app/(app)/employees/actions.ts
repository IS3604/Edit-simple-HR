'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionState, EmployeeStatus } from '@/lib/types';
import {
  friendlyDbError,
  parseEmployeeFields,
  parseNewEmployee,
  validatePassword,
} from '@/lib/validation/employee';

const BAN_FOREVER = '876000h';

/** Shared by the Add employee form and the Ask HR AI confirmation card. */
async function createEmployeeCore(fd: FormData): Promise<{ error?: string; id?: string; linked?: boolean; code?: string; name?: string }> {
  const me = await requireProfile(['superadmin']);
  const parsed = parseNewEmployee(fd);
  if (parsed.error || !parsed.data) return { error: parsed.error };
  const { email, role, password, ...fields } = parsed.data;

  const supabase = await createClient();

  // Pre-checks for clear messages (the DB constraints still enforce them).
  const { data: clash } = await supabase
    .from('employees')
    .select('employee_code, email')
    .or(`employee_code.eq.${fields.employee_code},email.eq.${email}`)
    .limit(1);
  if (clash?.length) {
    return { error: clash[0].email === email ? 'An employee with that email already exists.' : 'That Employee ID is already in use.' };
  }

  // A login with this email may already exist (e.g. the Superadmin adding themselves).
  const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();

  let profileId: string;
  let createdUser = false;

  if (existing) {
    profileId = existing.id;
  } else {
    const pwError = validatePassword(password);
    if (pwError) return { error: pwError };
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { full_name: fields.full_name },
    });
    if (error || !data.user) {
      return { error: error?.message?.includes('already') ? 'A login with that email already exists.' : 'Could not create the login. Please try again.' };
    }
    profileId = data.user.id;
    createdUser = true;
  }

  const { data: emp, error } = await supabase
    .from('employees')
    .insert({ ...fields, email, profile_id: profileId, created_by: me.id })
    .select('id')
    .single();

  if (error || !emp) {
    if (createdUser) await createAdminClient().auth.admin.deleteUser(profileId); // roll back the login
    return { error: friendlyDbError(error) };
  }

  revalidatePath('/employees');
  return { id: emp.id as string, linked: !!existing, code: fields.employee_code, name: fields.full_name };
}

export async function createEmployee(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await createEmployeeCore(fd);
  if (r.error || !r.id) return { error: r.error };
  redirect(`/employees/${r.id}?created=1${r.linked ? '&linked=1' : ''}`);
}

/** Ask HR AI card: same checks as the form, but returns instead of redirecting. */
export async function createEmployeeFromChat(fd: FormData): Promise<{ error?: string; id?: string; name?: string; code?: string; linked?: boolean }> {
  return createEmployeeCore(fd);
}

export async function updateEmployee(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['superadmin']);
  const id = String(fd.get('id') ?? '');
  const parsed = parseEmployeeFields(fd);
  if (!id) return { error: 'Missing employee.' };
  if (parsed.error || !parsed.data) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from('employees').update(parsed.data).eq('id', id).select('id').single();
  if (error) return { error: friendlyDbError(error) };

  revalidatePath('/employees');
  revalidatePath(`/employees/${id}`);
  return { success: 'Changes saved.' };
}

export async function setEmployeeStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['superadmin']);
  const id = String(fd.get('id') ?? '');
  const status = String(fd.get('status') ?? '') as EmployeeStatus;
  if (!id || !['active', 'inactive'].includes(status)) return { error: 'Invalid request.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_employee_status', { p_employee_id: id, p_status: status });
  if (error) return { error: friendlyDbError(error) };

  const { data: emp } = await supabase.from('employees').select('profile_id').eq('id', id).single();
  if (emp?.profile_id) {
    const { error: banError } = await createAdminClient().auth.admin.updateUserById(emp.profile_id, {
      ban_duration: status === 'active' ? 'none' : BAN_FOREVER,
    });
    if (banError) return { error: 'Status saved, but sign-in access could not be updated. Try again.' };
  }

  revalidatePath('/employees');
  revalidatePath(`/employees/${id}`);
  revalidatePath('/users');
  return { success: status === 'active' ? 'Employee reactivated.' : 'Employee deactivated.' };
}

export async function resetEmployeePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['superadmin']);
  const id = String(fd.get('id') ?? '');
  const password = String(fd.get('password') ?? '');
  const pwError = validatePassword(password);
  if (pwError) return { error: pwError };

  const supabase = await createClient();
  const { data: emp } = await supabase.from('employees').select('profile_id').eq('id', id).single();
  if (!emp?.profile_id) return { error: 'This employee has no login.' };

  const { error } = await createAdminClient().auth.admin.updateUserById(emp.profile_id, { password });
  if (error) return { error: 'Could not set the password. Please try again.' };
  return { success: 'Password updated. Share it with the employee securely.' };
}

export async function saveAllocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['superadmin']);
  const id = String(fd.get('id') ?? '');
  const num = (k: string) => {
    const raw = String(fd.get(k) ?? '').trim();
    return raw === '' ? 0 : Number(raw);
  };
  const values = { casual: num('casual'), earned: num('earned'), wfh: num('wfh') };
  for (const v of Object.values(values)) {
    if (!Number.isFinite(v) || v < 0 || v > 31 || !Number.isInteger(v * 2)) {
      return { error: 'Use numbers from 0 to 31, in steps of 0.5.' };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_allocation', {
    p_emp: id, p_casual: values.casual, p_earned: values.earned, p_wfh: values.wfh,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath(`/employees/${id}`);
  revalidatePath('/balances');
  return {
    success: data === 'credited'
      ? 'Saved and credited for this month.'
      : 'Saved. New amounts apply from the next monthly credit.',
  };
}
