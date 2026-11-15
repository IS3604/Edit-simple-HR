'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { ActionState } from '@/lib/types';

export async function addHoliday(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['superadmin']);
  const date = String(fd.get('holiday_date') ?? '');
  const name = String(fd.get('name') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Choose a date.' };
  if (!name || name.length > 80) return { error: 'Enter a name (up to 80 characters).' };

  const supabase = await createClient();
  const { error } = await supabase.from('holidays').insert({ holiday_date: date, name });
  if (error) return { error: error.code === '23505' ? 'A holiday already exists on that date.' : 'Could not add the holiday.' };
  revalidatePath('/holidays');
  return { success: 'Holiday added.' };
}

export async function deleteHoliday(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['superadmin']);
  const id = String(fd.get('id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.from('holidays').delete().eq('id', id);
  if (error) return { error: 'Could not remove the holiday.' };
  revalidatePath('/holidays');
  return { success: 'Removed.' };
}

export async function saveWeekend(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['superadmin']);
  const daysSel = fd.getAll('weekend').map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const unique = [...new Set(daysSel)].sort();
  if (unique.length > 3) return { error: 'Choose at most 3 weekend days.' };

  const supabase = await createClient();
  const { error } = await supabase.from('app_settings').update({ weekend_days: unique }).eq('id', 1);
  if (error) return { error: 'Could not save.' };
  revalidatePath('/holidays');
  revalidatePath('/leave');
  return { success: 'Working week saved.' };
}
