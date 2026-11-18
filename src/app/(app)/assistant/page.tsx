import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Source } from '@/lib/assistant/agent';
import { AssistantChat, type Msg } from './AssistantChat';

export const metadata = { title: 'Ask HR AI' };
export const maxDuration = 60;

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const me = await requireProfile(['superadmin']);
  const { c } = await searchParams;
  const db = await createClient();
  const [{ data: chats, error }, msgs] = await Promise.all([
    db.from('assistant_chats').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(40),
    c ? db.from('assistant_messages').select('id, role, content, sources').eq('chat_id', c).order('id').limit(200) : Promise.resolve({ data: [] }),
  ]);
  const messages: Msg[] = ((msgs.data ?? []) as { id: number; role: 'user' | 'assistant'; content: string; sources: Source[] }[])
    .map((m) => ({ id: String(m.id), role: m.role, content: m.content, sources: m.sources ?? [] }));

  return (
    <AssistantChat
      chatId={c ?? null}
      chats={(chats ?? []) as { id: string; title: string; updated_at: string }[]}
      initialMessages={messages}
      firstName={(me.full_name || me.email).split(/[\s@]/)[0]}
      setupError={error ? 'Chats can’t be loaded — run migration 0015 in Supabase.' : null}
    />
  );
}
