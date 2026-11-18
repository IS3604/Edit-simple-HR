import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { runAssistant, type AgentEvent, type ChatTurn } from '@/lib/assistant/agent';

export const maxDuration = 60;
export const preferredRegion = 'bom1';

/**
 * Ask HR AI. Streams newline-delimited JSON events:
 *   {type:'step',text} · {type:'delta',text} · {type:'reset'} · {type:'done',chatId,sources} · {type:'error',message}
 */
export async function POST(req: Request) {
  const me = await getCurrentProfile();
  if (!me || !me.is_active || me.role !== 'superadmin') return Response.json({ error: 'Superadmins only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const text = String(body?.message ?? '').trim();
  let chatId: string | null = typeof body?.chatId === 'string' && body.chatId ? body.chatId : null;
  if (!text) return Response.json({ error: 'Type a question.' }, { status: 400 });
  if (text.length > 4000) return Response.json({ error: 'Keep the question under 4,000 characters.' }, { status: 400 });

  const db = await createClient();
  let history: ChatTurn[] = [];
  if (chatId) {
    const { data, error } = await db.from('assistant_messages').select('role, content').eq('chat_id', chatId).order('id', { ascending: false }).limit(16);
    if (error) return Response.json({ error: 'Could not load this chat.' }, { status: 400 });
    history = ((data ?? []) as ChatTurn[]).reverse();
  }
  // Backup: the conversation on screen, in case saved history is missing.
  if (history.length === 0 && Array.isArray(body?.history)) {
    history = (body.history as unknown[])
      .filter((h): h is ChatTurn => !!h && typeof h === 'object' && ['user', 'assistant'].includes((h as ChatTurn).role) && typeof (h as ChatTurn).content === 'string')
      .slice(-16)
      .map((h) => ({ role: h.role, content: h.content.slice(0, 8000) }));
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent | Record<string, unknown>) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      try {
        const answer = await runAssistant(db, me.full_name || me.email, history, text, send);
        if (!chatId) {
          const title = text.replace(/\s+/g, ' ').slice(0, 70) + (text.length > 70 ? '…' : '');
          const { data, error } = await db.from('assistant_chats').insert({ title }).select('id').single();
          if (error || !data) throw new Error('Could not save the chat. Has migration 0015 been run in Supabase?');
          chatId = data.id as string;
        }
        const { error: saveErr } = await db.from('assistant_messages').insert([
          { chat_id: chatId, role: 'user', content: text, sources: [] }, // every row needs the same columns in a bulk insert
          { chat_id: chatId, role: 'assistant', content: answer.text.slice(0, 40000), sources: answer.sources },
        ]);
        if (saveErr) console.error('[assistant] save failed', saveErr);
        await db.from('assistant_chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
        send({ type: 'done', chatId, text: answer.text, sources: answer.sources, saveError: saveErr ? saveErr.message : undefined });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : 'The assistant failed. Try again.' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
