import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { todayIST } from '@/lib/leave-utils';
import { TOOLS, TOOL_LABEL, runTool } from './tools';

export type Source = { tool: string; label: string; args: Record<string, unknown> };
export type ChatTurn = { role: 'user' | 'assistant'; content: string };
/** Events streamed to the browser while the assistant works. */
export type AgentEvent =
  | { type: 'step'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'reset' };

const MAX_STEPS = 8;

function instructions(userName: string) {
  const today = todayIST();
  const weekday = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
  return `You are "Ask HR AI", the EditSimple HR assistant for ${userName}, a Superadmin. Today is ${weekday}, ${today} (India time).

How to answer
- Every fact about employees, leave, balances, requests, grants, holidays or users MUST come from a tool call in this conversation. Never guess or invent names, numbers or dates. If the tools return nothing, say so.
- Call as many tools as needed (they are fast). For totals, rankings or "how many days" use leave_report — it counts working days exactly.
- If a name matches several employees, list them and ask which one.
- Resolve relative dates ("next week", "last month", "this year") from today's date and state the exact range you used.
- Be concise. Use short tables for lists of people or numbers. Write days like 1.5 or 2 (no ".0").
- You can also help with general HR work: drafting emails or messages, summarising, explaining policy, planning cover.
- You are read-only. You cannot approve, grant, edit or delete anything. Tell the user where to do it in the app (Requests, Grants & deductions, Employees, Holidays, Users & roles).

Leave policy (for explanations)
- Casual Leave (CL): credited monthly; unused CL expires on 31 Dec; can't go below 0.
- Earned Leave (EL): credited monthly; carries over; monthly credit stops at the EL cap (usually 20); can't go below 0.
- WFH: monthly allocation, resets on the 1st; HR can approve extra WFH down to −10, and the shortfall comes off next month's allocation. Permanent WFH employees have no WFH balance.
- Unpaid leave: no balance; always needs Superadmin approval; salary is deducted.
- Requests within balance are auto-approved; extra WFH and unpaid leave need a Superadmin.
- Grants add days; negative grants are deductions. Revoking a grant takes back only unused days.
- Employee categories: Office / Hybrid ("office") and Permanent WFH.`;
}

const TYPE_WORD: Record<string, string> = { casual: 'CL', earned: 'EL', wfh: 'WFH', unpaid: 'unpaid' };
const fmtDate = (s: unknown) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  return new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const range = (a: Record<string, unknown>) => (fmtDate(a.from) && fmtDate(a.to) ? ` (${fmtDate(a.from)} – ${fmtDate(a.to)})` : '');

/** A short, human description of what a tool call is doing. */
export function stepLabel(name: string, a: Record<string, unknown>): string {
  const who = typeof a.employee === 'string' && a.employee ? a.employee : '';
  const type = TYPE_WORD[String(a.leave_type ?? '')] ?? '';
  switch (name) {
    case 'company_overview': return 'Checking today’s company overview';
    case 'search_employees': return a.query ? `Searching employees for “${a.query}”` : 'Going through the employee list';
    case 'get_employee': return `Looking up ${who || 'the employee'}’s profile and balances`;
    case 'list_requests': return `Checking ${[a.status, type].filter(Boolean).join(' ')} requests${who ? ` for ${who}` : ''}${range(a)}`.replace(/\s+/g, ' ');
    case 'leave_report': return `Counting ${type ? `${type} ` : ''}leave days${who ? ` for ${who}` : ''}${range(a)}`;
    case 'balance_history': return who ? `Reading ${who}’s balance history` : 'Reading the balance history';
    case 'list_grants': return `Checking grants and deductions${who ? ` for ${who}` : ''}`;
    case 'who_is_out': return `Checking who’s away${range(a)}`;
    case 'list_holidays': return `Checking holidays${range(a)}`;
    case 'list_users': return 'Checking logins and roles';
    default: return `Checking ${TOOL_LABEL[name] ?? name}`;
  }
}

type OutputItem = { type: string; [k: string]: unknown };

/** Read an OpenAI SSE stream; forward text deltas; return the completed response output. */
async function readStream(res: Response, onDelta: (t: string) => void): Promise<OutputItem[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let output: OutputItem[] | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data || data === '[DONE]') continue;
      let ev: { type?: string; delta?: string; response?: { output?: OutputItem[]; error?: { message?: string } }; message?: string; error?: { message?: string } };
      try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === 'response.output_text.delta' && ev.delta) onDelta(ev.delta);
      else if (ev.type === 'response.completed') output = ev.response?.output ?? [];
      else if (ev.type === 'response.failed' || ev.type === 'response.incomplete')
        throw new Error(ev.response?.error?.message ?? 'The AI could not finish this answer. Try again.');
      else if (ev.type === 'error') throw new Error(ev.message ?? ev.error?.message ?? 'OpenAI stream error');
    }
  }
  if (!output) throw new Error('The AI response ended early. Try again.');
  return output;
}

/** Run one assistant turn with OpenAI's Responses API (streaming) and our read-only tools. */
export async function runAssistant(
  db: SupabaseClient, userName: string, history: ChatTurn[], message: string, emit: (e: AgentEvent) => void = () => {},
) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set. Add it in Vercel → Settings → Environment Variables, then redeploy.');
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-terra';

  const input: unknown[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];
  const tools = TOOLS.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters }));
  const sources: Source[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    emit({ type: 'step', text: step === 0 ? 'Understanding your question' : 'Reading the results' });
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, instructions: instructions(userName), input, tools, store: false, stream: true }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(res.status === 401 ? 'OpenAI rejected the API key. Check OPENAI_API_KEY in Vercel.'
        : body?.error?.message ?? `OpenAI error ${res.status}`);
    }

    let streamed = '';
    let writing = false;
    const output = await readStream(res, (d) => {
      if (!writing) { writing = true; emit({ type: 'step', text: 'Writing the answer' }); }
      streamed += d;
      emit({ type: 'delta', text: d });
    });
    const calls = output.filter((o) => o.type === 'function_call');

    if (calls.length === 0) {
      const text = output
        .filter((o) => o.type === 'message')
        .flatMap((o) => (o.content as { type: string; text?: string }[]) ?? [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text ?? '')
        .join('\n')
        .trim() || streamed.trim();
      return { text: text || 'I couldn’t produce an answer. Try rephrasing.', sources };
    }

    if (streamed) emit({ type: 'reset' }); // text before a tool call was a preamble, not the answer
    input.push(...output);
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(String(c.arguments ?? '{}')); } catch { /* keep {} */ }
      const name = String(c.name);
      emit({ type: 'step', text: stepLabel(name, args) });
      sources.push({ tool: name, label: TOOL_LABEL[name] ?? name, args });
      input.push({ type: 'function_call_output', call_id: c.call_id, output: await runTool(db, name, args) });
    }
  }
  return { text: 'That needed too many lookups. Try a narrower question.', sources };
}
