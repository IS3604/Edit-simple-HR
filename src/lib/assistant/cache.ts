import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { todayIST } from '@/lib/leave-utils';
import type { ChatTurn, Source } from './agent';

/** "Who is Animesh??" and "who is animesh" are the same question. */
export function normalizeQuestion(q: string) {
  return q.toLowerCase().normalize('NFKC').replace(/[‘’]/g, "'").replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Cache key: the question, plus the last turn of context (so follow-ups like "what about him?"
 * only match in the same context), today's date (for "this week" etc.) and the HR data version.
 */
export function cacheKey(question: string, history: ChatTurn[], dataVersion: string) {
  const context = history.slice(-2).map((h) => `${h.role}:${normalizeQuestion(h.content).slice(0, 2000)}`).join('\n');
  return createHash('sha256').update([normalizeQuestion(question), context, todayIST(), dataVersion].join('␟')).digest('hex');
}

export async function dataVersion(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db.rpc('hr_data_version');
  return error || !data ? null : String(data);
}

export async function readCache(db: SupabaseClient, key: string): Promise<{ answer: string; sources: Source[] } | null> {
  const { data } = await db.from('assistant_cache').select('answer, sources, hits').eq('key', key).maybeSingle();
  if (!data) return null;
  void db.from('assistant_cache').update({ hits: Number(data.hits ?? 0) + 1 }).eq('key', key).then(() => {});
  return { answer: data.answer as string, sources: (data.sources ?? []) as Source[] };
}

export async function writeCache(db: SupabaseClient, key: string, answer: string, sources: Source[]) {
  await db.from('assistant_cache').upsert({ key, answer: answer.slice(0, 40000), sources });
  // Keep the table small: drop entries older than 7 days (they can't match anyway once the date changes).
  await db.from('assistant_cache').delete().lt('created_at', new Date(Date.now() - 7 * 864e5).toISOString());
}
