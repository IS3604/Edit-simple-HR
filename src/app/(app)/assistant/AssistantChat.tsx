'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Check, ChevronDown, Database, MessageSquarePlus, Sparkles, Square, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Source } from '@/lib/assistant/agent';
import { deleteAllChats, deleteChat } from './actions';

export type Msg = { id: string; role: 'user' | 'assistant'; content: string; sources?: Source[]; error?: boolean; steps?: number };
type Chat = { id: string; title: string; updated_at: string };

const SUGGESTIONS = [
  'Who is on leave or WFH this week?',
  'Which employees have the most unpaid days this year?',
  'Show me pending requests that need my decision',
  'Who has more than 15 EL?',
  'Leave report for last month by employee',
  'Draft a polite email reminding the team to plan December leave',
];

function Avatar() {
  return (
    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand to-amber-400 text-white shadow-xs">
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  );
}

function SourceChips({ sources, steps }: { sources: Source[]; steps?: number }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  const uniq = [...new Map(sources.map((s) => [s.label + JSON.stringify(s.args), s])).values()];
  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-2xs font-medium text-ink-500 hover:text-ink">
        <Check className="h-3 w-3 text-emerald-600" />
        Checked {uniq.length} source{uniq.length === 1 ? '' : 's'}{steps ? ` in ${steps} step${steps === 1 ? '' : 's'}` : ''}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 flex animate-fade-in flex-wrap gap-1.5">
          {uniq.map((s, i) => {
            const detail = Object.entries(s.args).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}: ${v}`).join(' · ');
            return (
              <span key={i} className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-2xs text-ink-600">
                <Database className="h-2.5 w-2.5 text-ink-400" />{s.label}{detail && <span className="text-ink-400"> · {detail}</span>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One step at a time: the current step slides in and shimmers; the counter ticks up. */
function StepTicker({ step, n }: { step: string; n: number }) {
  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <span className="relative grid h-4 w-4 place-items-center">
        <span className="absolute h-4 w-4 animate-ping rounded-full bg-brand/30" />
        <span className="h-2 w-2 rounded-full bg-brand" />
      </span>
      <span key={step} className="ai-step-in ai-shimmer text-[13px] font-medium">{step}</span>
      {n > 1 && <span key={`n${n}`} className="ai-step-in rounded-full bg-white px-1.5 text-2xs text-ink-400 ring-1 ring-line">step {n}</span>}
    </div>
  );
}

export function AssistantChat({ chatId, chats, initialMessages, firstName, setupError }: {
  chatId: string | null; chats: Chat[]; initialMessages: Msg[]; firstName: string; setupError: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [stepN, setStepN] = useState(0);
  const [draft, setDraft] = useState('');
  const [currentId, setCurrentId] = useState(chatId);
  const [confirm, setConfirm] = useState<{ id: string | 'all'; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, step, draft]);
  useEffect(() => { boxRef.current?.focus(); }, []);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    if (boxRef.current) boxRef.current.style.height = 'auto';
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', content: q }]);
    setBusy(true); setStep('Thinking'); setStepN(0); setDraft('');
    const ctrl = new AbortController(); abortRef.current = ctrl;
    let steps = 0;
    const fail = (message: string) => setMessages((m) => [...m, { id: `e${Date.now()}`, role: 'assistant', content: message, error: true }]);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ chatId: currentId, message: q }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        fail(j?.error ?? 'Something went wrong. Try again.');
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'step') { steps++; setStep(ev.text); setStepN(steps); }
          else if (ev.type === 'delta') setDraft((d) => d + ev.text);
          else if (ev.type === 'reset') setDraft('');
          else if (ev.type === 'error') fail(ev.message);
          else if (ev.type === 'done') {
            setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', content: ev.text, sources: ev.sources }]);
            if (!currentId) { setCurrentId(ev.chatId); window.history.replaceState(null, '', `/assistant?c=${ev.chatId}`); }
            router.refresh();
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') fail('Connection lost. Try again.');
      else setMessages((m) => [...m, { id: `s${Date.now()}`, role: 'assistant', content: '_Stopped._', error: false }]);
    } finally {
      setBusy(false); setStep(''); setDraft(''); abortRef.current = null;
    }
  }

  async function doDelete() {
    if (!confirm) return;
    setDeleting(true);
    if (confirm.id === 'all') await deleteAllChats(); else await deleteChat(confirm.id);
    setDeleting(false);
    const wasCurrent = confirm.id === 'all' || confirm.id === currentId;
    setConfirm(null);
    if (wasCurrent) { setMessages([]); setCurrentId(null); router.push('/assistant'); } else router.refresh();
  }

  const list = (
    <ul className="space-y-0.5">
      {chats.length === 0 && <li className="px-2 py-1.5 text-xs text-ink-400">No chats yet</li>}
      {chats.map((c) => (
        <li key={c.id} className="group relative">
          <Link href={`/assistant?c=${c.id}`}
            className={`block truncate rounded-md py-1.5 pl-2.5 pr-9 text-[13px] transition-colors ${c.id === currentId ? 'bg-white font-medium text-ink shadow-xs ring-1 ring-line' : 'text-ink-600 hover:bg-[#F1ECE6]'}`}>
            {c.title}
          </Link>
          <button type="button" onClick={() => setConfirm({ id: c.id, title: c.title })} aria-label={`Delete chat: ${c.title}`} title="Delete chat"
            className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-ink-400 opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      {/* Chat list (desktop) */}
      <aside className="hidden lg:block">
        <Link href="/assistant" className="mb-3 flex h-9 items-center justify-center gap-2 rounded-lg border border-line bg-white text-sm font-medium text-ink shadow-xs hover:bg-zinc-50">
          <MessageSquarePlus className="h-4 w-4 text-brand" /> New chat
        </Link>
        <div className="mb-1.5 flex items-center justify-between px-2">
          <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-400">Recent</p>
          {chats.length > 0 && (
            <button type="button" onClick={() => setConfirm({ id: 'all', title: '' })} className="text-2xs font-medium text-ink-400 hover:text-red-600">Delete all</button>
          )}
        </div>
        {list}
      </aside>

      {/* Conversation */}
      <section className="flex min-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-[#FFF4EC] via-white to-[#EEF6FC] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Avatar />
            <div>
              <h1 className="text-[15px] font-semibold text-ink">Ask HR AI</h1>
              <p className="text-2xs text-ink-500">Answers from live HR data · read-only · Superadmin only</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {currentId && (
              <button type="button" onClick={() => setConfirm({ id: currentId, title: chats.find((c) => c.id === currentId)?.title ?? 'this chat' })}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-xs font-medium text-ink-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Delete chat</span>
              </button>
            )}
            <Link href="/assistant" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-xs font-medium text-ink hover:bg-zinc-50 lg:hidden">
              <MessageSquarePlus className="h-3.5 w-3.5" /> New
            </Link>
          </div>
        </header>

        {/* Chat list (mobile) */}
        {chats.length > 0 && (
          <details className="group border-b border-line bg-[#FBF9F6] px-4 py-2 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-medium text-ink-600">
              Recent chats ({chats.length}) <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2">{list}
              <button type="button" onClick={() => setConfirm({ id: 'all', title: '' })} className="mt-2 px-2.5 text-xs font-medium text-red-600">Delete all chats</button>
            </div>
          </details>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {setupError && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{setupError}</p>}
          {messages.length === 0 && !busy ? (
            <div className="mx-auto max-w-2xl animate-pop-in pt-6 text-center">
              <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand to-amber-400 text-white shadow-card">
                <Sparkles className="h-6 w-6" />
              </span>
              <h2 className="font-display text-[28px] font-medium text-ink">Hi {firstName}, what do you want to know?</h2>
              <p className="mt-2 text-sm text-ink-500">Ask about any employee, leave, balances, requests, grants or holidays. I look everything up — no guessing.</p>
              <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
                {SUGGESTIONS.map((s, i) => (
                  <button key={s} type="button" onClick={() => send(s)} style={{ animationDelay: `${i * 50}ms` }}
                    className="ai-step-in rounded-xl border border-line bg-[#FBF9F6] px-3.5 py-2.5 text-[13px] text-ink-700 transition-all hover:-translate-y-px hover:border-brand-200 hover:bg-white">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.map((m) => m.role === 'user' ? (
                <div key={m.id} className="flex animate-pop-in justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[14px] text-white shadow-xs">{m.content}</div>
                </div>
              ) : (
                <div key={m.id} className="flex animate-pop-in gap-3">
                  <Avatar />
                  <div className={`min-w-0 flex-1 rounded-2xl rounded-tl-md border px-4 py-3 ${m.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-line bg-[#FBF9F6]'}`}>
                    <div className="assistant-md text-[14px] leading-relaxed text-ink">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                    {m.sources && <SourceChips sources={m.sources} steps={m.steps} />}
                  </div>
                </div>
              ))}

              {busy && (
                <div className="flex animate-pop-in gap-3">
                  <Avatar />
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-line bg-[#FBF9F6] px-4 py-3">
                    {draft ? (
                      <div className="assistant-md ai-typing text-[14px] leading-relaxed text-ink">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
                      </div>
                    ) : stepN === 0 ? (
                      <div className="flex items-center gap-1.5 py-1.5" aria-label="Thinking">
                        {[0, 1, 2].map((i) => <span key={i} className="ai-dot h-2 w-2 rounded-full bg-brand/70" style={{ animationDelay: `${i * 160}ms` }} />)}
                      </div>
                    ) : (
                      <StepTicker step={step} n={stepN} />
                    )}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-line bg-white p-3 sm:p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-line bg-[#FBF9F6] p-2 transition-shadow focus-within:border-brand-200 focus-within:ring-[3px] focus-within:ring-brand/10">
            <textarea ref={boxRef} rows={1} value={input} maxLength={4000}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Ask anything about your team…"
              className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] text-ink outline-none placeholder:text-ink-400" />
            {busy ? (
              <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Stop"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink text-white shadow-xs hover:bg-ink-700">
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} aria-label="Send"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-xs transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-40">
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mx-auto mt-1.5 max-w-3xl px-2 text-2xs text-ink-400">Enter to send · Shift+Enter for a new line · Employee data is sent to OpenAI to answer.</p>
        </form>
      </section>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={doDelete} loading={deleting} danger
        title={confirm?.id === 'all' ? 'Delete all chats?' : 'Delete this chat?'} confirmLabel="Delete"
        message={confirm?.id === 'all'
          ? <>All your Ask HR AI chats will be deleted. This can’t be undone.</>
          : <>“{confirm?.title}” and its messages will be deleted. This can’t be undone.</>} />
    </div>
  );
}
