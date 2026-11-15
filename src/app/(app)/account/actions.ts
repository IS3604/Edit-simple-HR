'use server';

import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { validatePassword } from '@/lib/validation/employee';
import type { ActionState } from '@/lib/types';

export async function changePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireProfile();
  const current = String(fd.get('current') ?? '');
  const next = String(fd.get('next') ?? '');
  const confirm = String(fd.get('confirm') ?? '');

  const pwError = validatePassword(next);
  if (pwError) return { error: pwError };
  if (next !== confirm) return { error: 'New passwords do not match.' };
  if (next === current) return { error: 'Choose a password different from the current one.' };

  const supabase = await createClient();
  const { error: authError } = await supabase.auth.signInWithPassword({ email: me.email, password: current });
  if (authError) return { error: 'Current password is incorrect.' };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: 'Could not update your password. Please try again.' };
  return { success: 'Password updated.' };
}
