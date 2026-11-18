// Cross-check: the AI's what-if planner (simulateYear) must match the real database engine
// month by month. Runs each scenario through apply_leave / decide_request / credit_monthly /
// expire_casual on real Postgres, then compares every month's closing balances.
// Usage: PGHOST=/tmp PGUSER=postgres npx tsx --conditions=react-server tests/simulate.cross.mts
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { simulateYear } from '../src/lib/assistant/tools';

const DB = 'hr_simcross';
const admin = new pg.Client({ database: 'postgres' }); await admin.connect();
await admin.query(`do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$`);
await admin.query(`drop database if exists ${DB} with (force)`); await admin.query(`create database ${DB}`); await admin.end();
const db = new pg.Pool({ database: DB, max: 2 });
await db.query(`create extension if not exists btree_gist; create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;`);
for (const f of readdirSync('supabase/migrations').sort().filter((f) => !f.includes('cron'))) await db.query(readFileSync(`supabase/migrations/${f}`, 'utf8'));
await db.query(`create or replace function public.today_local() returns date language sql stable security definer set search_path = public as
  $$ select coalesce(nullif(current_setting('app.today', true), '')::date, current_date) $$;`);

let TODAY = '2026-01-01';
async function as(uid: string | null, sql: string, params: unknown[] = []) {
  const c = await db.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('app.today', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [TODAY, uid ?? '']);
    if (uid) await c.query('set local role authenticated');
    const r = await c.query(sql, params); await c.query('commit'); return r;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}
const SA = '00000000-0000-0000-0000-0000000000aa';
await as(null, `insert into auth.users (id, email, raw_app_meta_data) values ($1, 'sa@x.in', '{"role":"superadmin"}')`, [SA]);
await as(SA, `insert into employees (profile_id, employee_code, full_name, email, joining_date, category) values ($1,'SA','Super','sa@x.in','2020-01-01','office')`, [SA]);
const HOL = ['2026-01-01', '2026-01-26', '2026-04-03', '2026-05-01', '2026-10-02', '2026-11-10', '2026-12-25'];
for (const d of HOL) await as(SA, `insert into holidays (holiday_date, name) values ($1, 'H')`, [d]);

const iso = (d: Date) => d.toISOString().slice(0, 10);
let empN = 0;
type Use = { month: number; leave_type: string; days: number };

async function engine(alloc: [number, number, number], start: { casual: number; earned: number; wfh: number }, usage: Use[], category = 'office') {
  const uid = `00000000-0000-0000-0000-${String(++empN).padStart(12, '0')}`;
  TODAY = '2025-12-31';
  await as(null, `insert into auth.users (id, email) values ($1, $2)`, [uid, `e${empN}@x.in`]);
  const emp = (await as(SA, `insert into employees (profile_id, employee_code, full_name, email, joining_date, category) values ($1,$2,$3,$4,'2025-01-01',$5) returning id`,
    [uid, `E${empN}`, `Emp ${empN}`, `e${empN}@x.in`, category])).rows[0].id;
  await as(null, `update leave_allocations set casual_per_month=$2, earned_per_month=$3, wfh_per_month=$4, configured_at=now() where employee_id=$1`, [emp, ...alloc]);
  // Starting balances (as of before Jan's credit)
  await as(null, `update leave_balances set casual_year = null, wfh_month = null where employee_id=$1`, [emp]);
  for (const [t, v] of Object.entries(start)) if (v) await as(null, `select _post_txn($1, $2::leave_type, 'adjustment', $3, null, null, null, 'start', null)`, [emp, t, v]);
  if (start.wfh) await as(null, `update leave_balances set wfh_month='2025-12-01' where employee_id=$1`, [emp]);
  const used = new Set<string>();
  const months: { CL: number; EL: number; WFH: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const first = `2026-${String(m).padStart(2, '0')}-01`;
    TODAY = first;
    await as(null, `select credit_monthly($1, $2)`, [emp, first]);
    for (const u of usage.filter((x) => x.month === m)) {
      // pick `days` free working days in the month
      const pick = (n: number) => {
        const out: string[] = []; const d = new Date(`${first}T00:00:00Z`); d.setUTCDate(2);
        while (out.length < n) {
          const s = iso(d);
          if (d.getUTCMonth() !== m - 1) throw new Error('month full');
          if (![0, 6].includes(d.getUTCDay()) && !HOL.includes(s) && !used.has(s)) out.push(s);
          d.setUTCDate(d.getUTCDate() + 1);
        }
        out.forEach((x) => used.add(x)); return out;
      };
      const bal = (await as(uid, `select casual::float c, earned::float e, wfh::float w from leave_overview where employee_id=$1`, [emp])).rows[0];
      if (u.leave_type === 'unpaid') {
        for (const d of pick(u.days)) { const r = (await as(uid, `select apply_leave('unpaid', $1, $1, 'x') j`, [d])).rows[0].j; await as(SA, `select decide_request($1, true, '')`, [r.id]); }
      } else if (u.leave_type === 'wfh') {
        if (category === 'permanent_wfh') continue;
        const take = Math.min(u.days, Math.max(0, bal.w + 10));
        for (const d of pick(take)) {
          const cur = (await as(uid, `select wfh::float w from leave_overview where employee_id=$1`, [emp])).rows[0].w;
          const r = (await as(uid, `select apply_leave('wfh', $1, $1, 'x', false, null, $2) j`, [d, cur < 1])).rows[0].j;
          if (r.status === 'pending') await as(SA, `select decide_request($1, true, '')`, [r.id]);
        }
      } else {
        const have = u.leave_type === 'casual' ? bal.c : bal.e;
        const take = Math.min(u.days, Math.max(0, Math.floor(have)));
        for (const d of pick(take)) await as(uid, `select apply_leave($1::leave_type, $2, $2, '')`, [u.leave_type, d]);
        for (const d of pick(u.days - take)) { const r = (await as(uid, `select apply_leave('unpaid', $1, $1, 'over') j`, [d])).rows[0].j; await as(SA, `select decide_request($1, true, '')`, [r.id]); }
      }
    }
    if (m === 12) { TODAY = '2026-12-31'; await as(null, `select expire_casual($1, 2026)`, [emp]); }
    const b = (await as(null, `select casual::float c, earned::float e, wfh::float w from leave_balances where employee_id=$1`, [emp])).rows[0];
    months.push({ CL: b.c, EL: b.e, WFH: b.w });
  }
  return months;
}

let n = 0;
async function check(name: string, alloc: [number, number, number], start: { casual: number; earned: number; wfh: number }, usage: Use[], category = 'office') {
  const real = await engine(alloc, start, usage, category);
  const sim = simulateYear({ year: 2026, alloc: { casual: alloc[0], earned: alloc[1], wfh: alloc[2] }, cap: 20, start, fromMonth: 1, usage, permanentWfh: category === 'permanent_wfh' });
  sim.rows.forEach((r, i) => {
    const expect = { CL: i === 11 ? 0 : r.end.CL, EL: r.end.EL, WFH: category === 'permanent_wfh' ? real[i].WFH : r.end.WFH };
    if (i === 11 && r.end.CL < 0) expect.CL = r.end.CL;
    assert.deepEqual(real[i], expect, `${name}: ${r.month} engine ${JSON.stringify(real[i])} vs planner ${JSON.stringify(expect)}`);
  });
  console.log(`  ✓ ${++n}. ${name}`);
}

// The user's question: CL 1/month except Nov & Dec, EL 1 in Mar & Jun, 2 WFH in May
const userQ: Use[] = [...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((m) => ({ month: m, leave_type: 'casual', days: 1 })),
  { month: 3, leave_type: 'earned', days: 1 }, { month: 6, leave_type: 'earned', days: 1 }, { month: 5, leave_type: 'wfh', days: 2 }];
await check('user’s scenario (CL 1, EL 1.5, WFH 4)', [1, 1.5, 4], { casual: 0, earned: 0, wfh: 0 }, userQ);
await check('over-asking: 3 CL in Jan, 4 EL in Feb → excess becomes unpaid', [1, 1.5, 4], { casual: 0, earned: 0, wfh: 0 },
  [{ month: 1, leave_type: 'casual', days: 3 }, { month: 2, leave_type: 'earned', days: 4 }, { month: 2, leave_type: 'unpaid', days: 1 }]);
await check('WFH beyond balance with HR approval, shortfall off next month, −10 limit', [1, 1.5, 2], { casual: 0, earned: 0, wfh: 0 },
  [{ month: 3, leave_type: 'wfh', days: 6 }, { month: 4, leave_type: 'wfh', days: 9 }, { month: 7, leave_type: 'wfh', days: 1 }]);
await check('EL near the cap (start 19)', [1, 1.5, 4], { casual: 0, earned: 19, wfh: 0 }, [{ month: 4, leave_type: 'earned', days: 2 }]);
await check('saves all CL — expires 31 Dec', [1, 2, 0], { casual: 0, earned: 5, wfh: 0 }, [{ month: 9, leave_type: 'earned', days: 3 }]);
await db.end();
console.log(`\nAll ${n} planner-vs-engine checks passed.`);
