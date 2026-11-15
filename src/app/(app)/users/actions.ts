'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { friendlyDbError } from '@/lib/validation/employee';
import { ROLES, type ActionState, type Role } from '@/lib/types';

export async function updateUserAccess(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireProfile(['superadmin']);

  const id = String(formData.get('id') ?? '');
  const role = String(formData.get('role') ?? '') as Role;
  const isActive = formData.get('is_active') === 'on';

  if (!id) return { error: 'Missing user.' };
  if (!ROLES.includes(role)) return { error: 'Invalid role.' };
  if (id === me.id && (role !== 'superadmin' || !isActive)) {
    return { error: "You can't change your own role or deactivate yourself." };
  }

  // Runs under RLS — the database rejects this unless the caller is a Superadmin.
  const supabase = await createClient();
  const { data: before } = await supabase.from('profiles').select('is_active, role').eq('id', id).single();
  if (!before) return { error: 'User not found.' };

  if (before.role !== role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id).select('id').single();
    if (error) return { error: friendlyDbError(error) };
  }

  if (before.is_active !== isActive) {
    // If the login belongs to an employee, change status through the HR record
    // so pending requests are cancelled and both stay in sync.
    const { data: emp } = await supabase.from('employees').select('id').eq('profile_id', id).maybeSingle();
    const { error } = emp
      ? await supabase.rpc('set_employee_status', { p_employee_id: emp.id, p_status: isActive ? 'active' : 'inactive' })
      : await supabase.from('profiles').update({ is_active: isActive }).eq('id', id).select('id').single();
    if (error) return { error: friendlyDbError(error) };

    const { error: banError } = await createAdminClient().auth.admin.updateUserById(id, {
      ban_duration: isActive ? 'none' : '876000h',
    });
    if (banError) return { error: 'Saved, but sign-in access could not be updated. Try again.' };
  }

  revalidatePath('/users');
  revalidatePath('/employees');
  return { success: 'Saved' };
}
