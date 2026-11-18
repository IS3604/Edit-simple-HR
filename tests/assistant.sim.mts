// Ask AI simulation: mock OpenAI Responses API + stub Supabase client.
// Usage: npx tsx --conditions=react-server tests/assistant.sim.mts
import assert from 'node:assert/strict';
import { runAssistant, stepLabel, type AgentEvent } from '../src/lib/assistant/agent';
import { runTool, TOOLS } from '../src/lib/assistant/tools';

// ---- tiny chainable Supabase stub: records filters, returns canned rows per table/rpc ----
type Rows = Record<string, unknown>[];
const calls: string[] = [];
function stub(tables: Record<string, Rows | ((f: string[]) => Rows)>, rpcs: Record<string, unknown> = {}) {
  const builder = (table: string) => {
    const f: string[] = [];
    const res = () => { const t = tables[table]; const data = typeof t === 'function' ? t(f) : (t ?? []); calls.push(`${table}:${f.join('&')}`); return { data, error: null }; };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'ilike', 'or', 'in', 'is', 'order', 'limit']) b[m] = (...a: unknown[]) => { f.push(`${m}(${a.map((x) => JSON.stringify(x)).join(',')})`); return b; };
    b.single = async () => { const r = res(); return { data: (r.data as Rows)[0] ?? null, error: null }; };
    b.maybeSingle = b.single;
    b.then = (ok: (v: unknown) => void) => ok(res());
    return b;
  };
  return { from: builder, rpc: async (n: string) => ({ data: rpcs[n] ?? null, error: null }) } as never;
}

/** Build an OpenAI-style SSE response: optional text deltas, then response.completed with the output. */
function sse(output: unknown[], deltas: string[] = []) {
  const ev = [...deltas.map((d) => ({ type: 'response.output_text.delta', delta: d })), { type: 'response.completed', response: { output } }];
  const body = ev.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  // split into awkward chunks to test buffering
  const bytes = new TextEncoder().encode(body);
  return new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 37) c.enqueue(bytes.slice(i, i + 37)); c.close(); } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

let n = 0; const ok = (m: string) => console.log(`  ✓ ${++n}. ${m}`);

// 1. leave_report: range clipping, weekends, holidays, half-days, totals exclude WFH
{
  const db = stub({
    app_settings: [{ weekend_days: [0, 6], el_cap: 20 }],
    holidays: [{ holiday_date: '2026-11-10' }],
    leave_requests: [
      { employee_id: 'a', leave_type: 'casual', start_date: '2026-10-29', end_date: '2026-11-04', half_day: false, employee: { full_name: 'Asha' } }, // clip to 2–4 Nov = 3
      { employee_id: 'a', leave_type: 'unpaid', start_date: '2026-11-09', end_date: '2026-11-11', half_day: false, employee: { full_name: 'Asha' } }, // 9,11 (10 holiday) = 2
      { employee_id: 'a', leave_type: 'wfh', start_date: '2026-11-13', end_date: '2026-11-16', half_day: false, employee: { full_name: 'Asha' } },   // 13,16 = 2 (not in total)
      { employee_id: 'b', leave_type: 'earned', start_date: '2026-11-20', end_date: '2026-11-20', half_day: true, employee: { full_name: 'Ravi' } },   // 0.5
      { employee_id: 'b', leave_type: 'earned', start_date: '2026-11-14', end_date: '2026-11-15', half_day: false, employee: { full_name: 'Ravi' } },  // weekend = 0
    ],
  });
  const out = JSON.parse(await runTool(db, 'leave_report', { from: '2026-11-01', to: '2026-11-30' }));
  assert.deepEqual(out.employees.map((e: { employee: { full_name: string } }) => e.employee.full_name), ['Asha', 'Ravi']);
  const [a, b] = out.employees;
  assert.deepEqual([a.casual, a.unpaid, a.wfh, a.total], [3, 2, 2, 5]);
  assert.deepEqual([b.earned, b.total], [0.5, 0.5]);
  ok('leave_report: clips to range, skips weekends/holidays, half-day = 0.5, total excludes WFH, sorted');
  const bad = JSON.parse(await runTool(db, 'leave_report', { from: '2026-11-30', to: '2026-11-01' }));
  assert.ok(bad.error);
  ok('leave_report rejects an inverted range');
}

// 2. Employee resolution: ambiguous names ask; exact code wins; injection chars are stripped
{
  const many = [{ id: '1', full_name: 'Asha Rao', employee_code: 'ES-1' }, { id: '2', full_name: 'Asha Mehta', employee_code: 'ES-2' }];
  const db = stub({ employees: many, leave_overview: [{ casual: 1 }] });
  const amb = JSON.parse(await runTool(db, 'get_employee', { employee: 'Asha' }));
  assert.match(amb.error, /more than one/); assert.equal(amb.candidates.length, 2);
  const exact = JSON.parse(await runTool(db, 'get_employee', { employee: 'es-2' }));
  assert.equal(exact.employee.full_name, 'Asha Mehta');
  calls.length = 0;
  await runTool(db, 'search_employees', { query: "a%),role.eq.superadmin,(x" });
  assert.ok(!calls.some((c) => c.includes('%)') || c.includes('role.eq')), calls.join('\n'));
  ok('employee lookup: ambiguous → candidates; exact code wins; filter-injection characters stripped');
  const unknown = JSON.parse(await runTool(db, 'nope', {}));
  assert.ok(unknown.error);
  ok('unknown tool returns an error, not a crash');
}

// 3. Agent loop (streaming) with a mock OpenAI: preamble → tool call → streamed answer
{
  const db = stub({ employees: [{ id: '9', full_name: 'Meera Iyer', employee_code: 'ES-9' }], leave_overview: [{ earned: 16, unpaid_year: 2 }] });
  const seen: Record<string, unknown>[] = [];
  process.env.OPENAI_API_KEY = 'sk-test';
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    seen.push(body);
    if (seen.length === 1) {
      assert.equal(body.stream, true); assert.equal(body.store, false);
      assert.ok(body.instructions.includes('MUST come from a tool call'));
      assert.equal(body.tools.length, TOOLS.length);
      return sse([{ type: 'reasoning', id: 'r1', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: 'Let me check.' }] },
        { type: 'function_call', call_id: 'c1', name: 'get_employee', arguments: '{"employee":"Meera"}' }], ['Let me ', 'check.']);
    }
    const out = body.input.find((i: { type?: string }) => i.type === 'function_call_output');
    assert.equal(out.call_id, 'c1');
    assert.equal(JSON.parse(out.output).balances.earned, 16);
    assert.ok(body.input.some((i: { type?: string }) => i.type === 'reasoning'), 'reasoning items passed back');
    return sse([{ type: 'message', content: [{ type: 'output_text', text: 'Meera has **16 EL**.' }] }], ['Meera has ', '**16 EL**', '.']);
  }) as never;
  const events: AgentEvent[] = [];
  const r = await runAssistant(db, 'Ishpreet', [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello' }], 'How much EL does Meera have?', (e) => events.push(e));
  assert.equal(r.text, 'Meera has **16 EL**.');
  assert.deepEqual(r.sources.map((s) => s.tool), ['get_employee']);
  assert.equal((seen[0].input as unknown[]).length, 3);
  const steps = events.filter((e) => e.type === 'step').map((e) => (e as { text: string }).text);
  assert.deepEqual(steps, ['Understanding your question', 'Writing the answer', 'Looking up Meera’s profile and balances', 'Reading the results', 'Writing the answer']);
  const resetAt = events.findIndex((e) => e.type === 'reset');
  assert.ok(resetAt > 0, 'preamble text is cleared before the tool runs');
  const finalText = events.slice(resetAt + 1).filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('');
  assert.equal(finalText, 'Meera has **16 EL**.');
  ok('streaming agent: steps arrive one at a time; preamble cleared; answer streamed token by token; SSE split across chunks');
}

// 4. Step labels read naturally
{
  assert.equal(stepLabel('leave_report', { from: '2026-10-01', to: '2026-10-31', leave_type: 'unpaid' }), 'Counting unpaid leave days (1 Oct – 31 Oct)');
  assert.equal(stepLabel('list_requests', { status: 'pending', leave_type: 'wfh', employee: 'Ravi' }), 'Checking pending WFH requests for Ravi');
  assert.equal(stepLabel('balance_history', {}), 'Reading the balance history');
  assert.equal(stepLabel('who_is_out', { from: '2026-11-23', to: '2026-11-29' }), 'Checking who’s away (23 Nov – 29 Nov)');
  ok('step labels: human-readable with dates and names');
}

// 5. Errors: bad key, missing key, stream failure, runaway tool loops
{
  const db = stub({});
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 })) as never;
  await assert.rejects(runAssistant(db, 'x', [], 'q'), /rejected the API key/);
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(runAssistant(db, 'x', [], 'q'), /OPENAI_API_KEY is not set/);
  process.env.OPENAI_API_KEY = 'sk-test';
  globalThis.fetch = (async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"type":"response.failed","response":{"error":{"message":"rate limited"}}}\n\n')); c.close(); } }), { status: 200 })) as never;
  await assert.rejects(runAssistant(db, 'x', [], 'q'), /rate limited/);
  globalThis.fetch = (async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"hal')); c.close(); } }), { status: 200 })) as never;
  await assert.rejects(runAssistant(db, 'x', [], 'q'), /ended early/);
  let hits = 0;
  globalThis.fetch = (async () => { hits++; return sse([{ type: 'function_call', call_id: `c${hits}`, name: 'list_holidays', arguments: '{"from":"2026-01-01","to":"2026-12-31"}' }]); }) as never;
  const r = await runAssistant(stub({ holidays: [] }), 'x', [], 'loop');
  assert.equal(hits, 8); assert.match(r.text, /too many lookups/);
  ok('errors: 401, missing key, failed or cut-off stream all give clear messages; tool loop capped at 8');
}

console.log(`\nAll ${n} assistant checks passed.`);
