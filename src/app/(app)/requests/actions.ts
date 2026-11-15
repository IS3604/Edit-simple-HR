'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { friendlyDbError } from '@/lib/validation/employee';
import type { ActionState } from '@/lib/types';

export async function decideRequest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireProfile(['superadmin', 'admin']);
  const id = String(fd.get('id') ?? '');
  const decision = String(fd.get('decision') ?? '');
  const note = String(fd.get('note') ?? '').trim();
  if (!id || !['approve', 'reject'].includes(decision)) return { error: 'Invalid request.' };
  if (note.length > 500) return { error: 'Note must be under 500 characters.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('decide_request', { p_id: id, p_approve: decision === 'approve', p_note: note });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath('/requests');
  revalidatePath('/');
  revalidatePath('/balances');
  return { success: decision === 'approve' ? 'Approved' : 'Rejected' };
}
