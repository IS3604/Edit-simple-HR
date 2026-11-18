import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countWorkingDays } from '@/lib/leave-utils';

/**
 * Read-only tools for the Superadmin assistant. Every tool queries Supabase with the
 * signed-in Superadmin's session, so Row Level Security still applies.
 */

type Json = Record<string, unknown>;
type Tool = {
  name: string;
  description: string;
  parameters: Json;
  run: (db: SupabaseClient, args: Json) => Promise<unknown>;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEAVE_TYPES = ['casual', 'earned', 'wfh', 'unpaid'];
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

const str = (v: unknown, max = 100) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const date = (v: unknown) => (typeof v === 'string' && DATE.test(v) ? v : '');
const safeLike = (s: string) => s.replace(/[%,()*\\:."']/g, ' ').trim();
const num = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
};
const fail = (message: string) => ({ error: message });

const EMP_COLS = 'id, employee_code, full_name, email, department, designation, joining_date, category, status';

/** Find one employee from an id, code, email or (part of a) name. */
async function resolveEmployee(db: SupabaseClient, who: unknown): Promise<{ emp?: Json; error?: string; candidates?: Json[] }> {
  const q = str(who, 120);
  if (!q) return { error: 'Say which employee (name, employee code or email).' };
  if (UUID.test(q)) {
    const { data } = await db.from('employees').select(EMP_COLS).eq('id', q).maybeSingle();
    return data ? { emp: data } : { error: 'No employee with that id.' };
  }
  const s = safeLike(q);
  if (!s) return { error: 'Say which employee.' };
  const { data } = await db.from('employees').select(EMP_COLS)
    .or(`full_name.ilike.%${s}%,employee_code.ilike.${s},email.ilike.${s}%`).order('full_name').limit(10);
  const rows = (data ?? []) as Json[];
  if (rows.length === 0) return { error: `No employee matches "${q}".` };
  if (rows.length === 1) return { emp: rows[0] };
  const exact = rows.filter((r) => String(r.full_name).toLowerCase() === q.toLowerCase() || String(r.employee_code).toLowerCase() === q.toLowerCase());
  if (exact.length === 1) return { emp: exact[0] };
  return { error: `"${q}" matches more than one employee — ask which one.`, candidates: rows };
}

async function calendarBasics(db: SupabaseClient, from: string, to: string) {
  const [{ data: s }, { data: h }] = await Promise.all([
    db.from('app_settings').select('weekend_days, el_cap').eq('id', 1).single(),
    db.from('holidays').select('holiday_date').gte('holiday_date', from).lte('holiday_date', to),
  ]);
  return {
    weekend: ((s?.weekend_days as number[]) ?? [0, 6]),
    holidays: new Set(((h ?? []) as { holiday_date: string }[]).map((x) => x.holiday_date)),
  };
}

export const TOOLS: Tool[] = [
  {
    name: 'company_overview',
    description: 'Headcount, who is on leave / WFH today, pending requests, unpaid days this month, and company leave settings (weekend days, EL cap).',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async run(db) {
      const [{ data: hr, error }, { data: settings }] = await Promise.all([
        db.rpc('hr_overview'),
        db.from('app_settings').select('weekend_days, timezone, el_cap').eq('id', 1).single(),
      ]);
      if (error) return fail(error.message);
      return { overview: hr, settings };
    },
  },
  {
    name: 'search_employees',
    description: 'List employees, optionally filtered by name/code text, department, category or status. Use it to find people or count them.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part of a name, employee code or email' },
        department: { type: 'string' },
        category: { type: 'string', enum: ['office', 'permanent_wfh'], description: 'office = Office / Hybrid' },
        status: { type: 'string', enum: ['active', 'inactive', 'all'], description: 'Default active' },
      },
      additionalProperties: false,
    },
    async run(db, a) {
      let q = db.from('employees').select(EMP_COLS).order('full_name').limit(300);
      const status = str(a.status) || 'active';
      if (status !== 'all') q = q.eq('status', status);
      if (a.category === 'office' || a.category === 'permanent_wfh') q = q.eq('category', a.category);
      const dept = safeLike(str(a.department));
      if (dept) q = q.ilike('department', `%${dept}%`);
      const s = safeLike(str(a.query));
      if (s) q = q.or(`full_name.ilike.%${s}%,employee_code.ilike.%${s}%,email.ilike.%${s}%`);
      const { data, error } = await q;
      if (error) return fail(error.message);
      return { count: data?.length ?? 0, employees: data };
    },
  },
  {
    name: 'get_employee',
    description: 'Full profile of one employee: details, login role, current CL/EL/WFH balances, monthly allocation, pending days, unpaid days this month and year.',
    parameters: {
      type: 'object',
      properties: { employee: { type: 'string', description: 'Name, employee code, email or id' } },
      required: ['employee'], additionalProperties: false,
    },
    async run(db, a) {
      const r = await resolveEmployee(db, a.employee);
      if (!r.emp) return { error: r.error, candidates: r.candidates };
      const id = r.emp.id as string;
      const [{ data: ov }, { data: login }] = await Promise.all([
        db.from('leave_overview').select('*').eq('employee_id', id).maybeSingle(),
        db.from('employees').select('profile:profiles!employees_profile_id_fkey(role, is_active)').eq('id', id).maybeSingle(),
      ]);
      return { employee: r.emp, login: (login as Json | null)?.profile ?? null, balances: ov };
    },
  },
  {
    name: 'list_requests',
    description: 'Leave / WFH / unpaid requests with dates, days, reason, status and who decided. Filter by employee, status, type and a date range (requests overlapping the range).',
    parameters: {
      type: 'object',
      properties: {
        employee: { type: 'string', description: 'Name, code, email or id (omit for everyone)' },
        status: { type: 'string', enum: STATUSES },
        leave_type: { type: 'string', enum: LEAVE_TYPES },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'integer', description: 'Max rows, default 50, up to 200' },
      },
      additionalProperties: false,
    },
    async run(db, a) {
      let q = db.from('leave_requests')
        .select('id, leave_type, start_date, end_date, days, half_day, half_day_session, reason, status, is_extra, extra_days, auto_approved, decision_note, decided_at, created_at, ' +
          'employee:employees!leave_requests_employee_id_fkey(full_name, employee_code), decider:profiles!leave_requests_decided_by_fkey(full_name)')
        .order('start_date', { ascending: false }).limit(num(a.limit, 50, 1, 200));
      if (a.employee) {
        const r = await resolveEmployee(db, a.employee);
        if (!r.emp) return { error: r.error, candidates: r.candidates };
        q = q.eq('employee_id', r.emp.id as string);
      }
      if (STATUSES.includes(str(a.status))) q = q.eq('status', str(a.status));
      if (LEAVE_TYPES.includes(str(a.leave_type))) q = q.eq('leave_type', str(a.leave_type));
      if (date(a.from)) q = q.gte('end_date', date(a.from));
      if (date(a.to)) q = q.lte('start_date', date(a.to));
      const { data, error } = await q;
      if (error) return fail(error.message);
      return { count: data?.length ?? 0, requests: data };
    },
  },
  {
    name: 'leave_report',
    description: 'Exact working days of APPROVED leave taken per employee and type within a date range (weekends, holidays and half-days handled). Use for totals, rankings and comparisons.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        leave_type: { type: 'string', enum: LEAVE_TYPES },
        employee: { type: 'string', description: 'Optional: one employee' },
      },
      required: ['from', 'to'], additionalProperties: false,
    },
    async run(db, a) {
      const from = date(a.from), to = date(a.to);
      if (!from || !to || to < from) return fail('Give a valid from/to range (YYYY-MM-DD).');
      let q = db.from('leave_requests')
        .select('employee_id, leave_type, start_date, end_date, days, half_day, employee:employees!leave_requests_employee_id_fkey(full_name, employee_code, status)')
        .eq('status', 'approved').lte('start_date', to).gte('end_date', from).limit(5000);
      if (LEAVE_TYPES.includes(str(a.leave_type))) q = q.eq('leave_type', str(a.leave_type));
      if (a.employee) {
        const r = await resolveEmployee(db, a.employee);
        if (!r.emp) return { error: r.error, candidates: r.candidates };
        q = q.eq('employee_id', r.emp.id as string);
      }
      const [{ data, error }, cal] = await Promise.all([q, calendarBasics(db, from, to)]);
      if (error) return fail(error.message);
      const per = new Map<string, Json & { total: number }>();
      for (const r of (data ?? []) as unknown as { employee_id: string; leave_type: string; start_date: string; end_date: string; half_day: boolean; employee: Json }[]) {
        const s = r.start_date < from ? from : r.start_date;
        const e = r.end_date > to ? to : r.end_date;
        const d = r.half_day ? 0.5 : countWorkingDays(s, e, cal.weekend, cal.holidays);
        if (!d) continue;
        const row = per.get(r.employee_id) ?? { employee: r.employee, casual: 0, earned: 0, wfh: 0, unpaid: 0, total: 0 };
        row[r.leave_type] = Number(row[r.leave_type] ?? 0) + d;
        if (r.leave_type !== 'wfh') row.total += d;
        per.set(r.employee_id, row);
      }
      const rows = [...per.values()].sort((x, y) => y.total - x.total);
      return { from, to, note: 'total = leave days excluding WFH', employees: rows };
    },
  },
  {
    name: 'balance_history',
    description: "Ledger of one employee's balance changes (monthly credits, leave taken, grants, deductions, refunds, expiry) with the balance after each line.",
    parameters: {
      type: 'object',
      properties: {
        employee: { type: 'string' },
        leave_type: { type: 'string', enum: ['casual', 'earned', 'wfh'] },
        from: { type: 'string' }, to: { type: 'string' },
        limit: { type: 'integer', description: 'Default 40, up to 200' },
      },
      required: ['employee'], additionalProperties: false,
    },
    async run(db, a) {
      const r = await resolveEmployee(db, a.employee);
      if (!r.emp) return { error: r.error, candidates: r.candidates };
      let q = db.from('leave_transactions').select('leave_type, kind, amount, balance_after, period, note, created_at')
        .eq('employee_id', r.emp.id as string).order('id', { ascending: false }).limit(num(a.limit, 40, 1, 200));
      if (['casual', 'earned', 'wfh'].includes(str(a.leave_type))) q = q.eq('leave_type', str(a.leave_type));
      if (date(a.from)) q = q.gte('created_at', date(a.from));
      if (date(a.to)) q = q.lte('created_at', `${date(a.to)}T23:59:59`);
      const { data, error } = await q;
      if (error) return fail(error.message);
      return { employee: r.emp.full_name, lines: data };
    },
  },
  {
    name: 'list_grants',
    description: 'Special grants and deductions (positive days = added, negative = deducted), with reason, who granted, and revoke details.',
    parameters: {
      type: 'object',
      properties: { employee: { type: 'string' }, include_revoked: { type: 'boolean' }, limit: { type: 'integer' } },
      additionalProperties: false,
    },
    async run(db, a) {
      let q = db.from('special_grants')
        .select('leave_type, days, reason, granted_on, revoked_at, revoked_days, revoke_owed, employee:employees(full_name, employee_code), granter:profiles!special_grants_granted_by_fkey(full_name)')
        .order('created_at', { ascending: false }).limit(num(a.limit, 50, 1, 200));
      if (a.employee) {
        const r = await resolveEmployee(db, a.employee);
        if (!r.emp) return { error: r.error, candidates: r.candidates };
        q = q.eq('employee_id', r.emp.id as string);
      }
      if (!a.include_revoked) q = q.is('revoked_at', null);
      const { data, error } = await q;
      if (error) return fail(error.message);
      return { grants: data };
    },
  },
  {
    name: 'who_is_out',
    description: 'Approved leave and WFH day by day for a date range (max 62 days): who is away or working from home on which dates.',
    parameters: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'], additionalProperties: false,
    },
    async run(db, a) {
      const from = date(a.from), to = date(a.to);
      if (!from || !to || to < from) return fail('Give a valid from/to range.');
      const { data, error } = await db.rpc('team_calendar', { p_from: from, p_to: to });
      if (error) return fail(error.message);
      return { from, to, entries: data };
    },
  },
  {
    name: 'list_holidays',
    description: 'Company holidays in a date range.',
    parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'], additionalProperties: false },
    async run(db, a) {
      const from = date(a.from), to = date(a.to);
      if (!from || !to) return fail('Give a valid from/to range.');
      const { data, error } = await db.from('holidays').select('holiday_date, name').gte('holiday_date', from).lte('holiday_date', to).order('holiday_date');
      if (error) return fail(error.message);
      return { holidays: data };
    },
  },
  {
    name: 'list_users',
    description: 'App logins with their role (superadmin / admin / employee) and whether they are active.',
    parameters: { type: 'object', properties: { role: { type: 'string', enum: ['superadmin', 'admin', 'employee'] } }, additionalProperties: false },
    async run(db, a) {
      let q = db.from('profiles').select('full_name, email, role, is_active, created_at').order('full_name').limit(500);
      if (['superadmin', 'admin', 'employee'].includes(str(a.role))) q = q.eq('role', str(a.role));
      const { data, error } = await q;
      if (error) return fail(error.message);
      return { count: data?.length ?? 0, users: data };
    },
  },
];

export const TOOL_LABEL: Record<string, string> = {
  company_overview: 'Company overview', search_employees: 'Employees', get_employee: 'Employee profile',
  list_requests: 'Requests', leave_report: 'Leave report', balance_history: 'Balance history',
  list_grants: 'Grants', who_is_out: 'Team calendar', list_holidays: 'Holidays', list_users: 'Users & roles',
};

export async function runTool(db: SupabaseClient, name: string, args: Json): Promise<string> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return JSON.stringify({ error: `Unknown tool ${name}` });
  try {
    const out = JSON.stringify(await tool.run(db, args ?? {}));
    return out.length > 60000 ? `${out.slice(0, 60000)}…[truncated: narrow the filters]` : out;
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : 'Tool failed' });
  }
}
