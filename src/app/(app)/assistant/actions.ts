'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function deleteChat(chatId: string): Promise<{ ok: boolean }> {
  await requireProfile(['superadmin']);
  const db = await createClient();
  const { error } = await db.from('assistant_chats').delete().eq('id', chatId);
  revalidatePath('/assistant');
  return { ok: !error };
}

export async function deleteAllChats(): Promise<{ ok: boolean }> {
  const me = await requireProfile(['superadmin']);
  const db = await createClient();
  const { error } = await db.from('assistant_chats').delete().eq('user_id', me.id);
  revalidatePath('/assistant');
  return { ok: !error };
}
