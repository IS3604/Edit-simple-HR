'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type AiMode = 'manual' | 'smart' | 'auto';

export async function setAiMode(mode: AiMode): Promise<{ ok: boolean; error?: string }> {
  await requireProfile(['superadmin']);
  if (!['manual', 'smart', 'auto'].includes(mode)) return { ok: false, error: 'Invalid mode.' };
  const db = await createClient();
  const { error } = await db.from('app_settings').update({ ai_mode: mode }).eq('id', 1);
  if (error) return { ok: false, error: error.message.includes('ai_mode') ? 'Run migration 0017 in Supabase first.' : 'Could not save.' };
  revalidatePath('/assistant');
  return { ok: true };
}
