// =====================================================================
// EditSimple HR — scenario simulation with "AI employees"
//
// Runs every migration (except pg_cron) on a REAL PostgreSQL server, with the
// same default privileges hosted Supabase uses, then:
//   1. plays scripted scenarios for 8 personas (explicit expectations), and
//   2. simulates a full year day-by-day (Jan 2026 → Jan 2027) where each AI
//      employee randomly applies, raises extra requests, takes half-days and
//      cancels, while the Superadmin decides and the daily cron runs,
//   3. checks ledger/balance invariants throughout.
//
// Usage:  PGHOST=/tmp PGUSER=postgres node tests/scenarios.test.mjs [seed]
// =====================================================================
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DB = 'hr_scenarios';
const SEED = Number(process.argv[2] ?? 42);

// ---------- deterministic RNG ----------
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(SEED);
const pick = (a) => a[Math.floor(rand() * a.length)];
const chance = (p) => rand() < p;

// ---------- setup ----------
const admin = new pg.Client({ database: 'postgres' });
await admin.connect();
await admin.query(`do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$`);
await admin.query(`drop database if exists ${DB} with (force)`);
await admin.query(`create database ${DB}`);
await admin.end();

const db = new pg.Pool({ database: DB, max: 4 });
await db.query(`
  create extension if not exists btree_gist;
  create schema if not exists auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated, service_role;
  -- Same default privileges as hosted Supabase (migrations must revoke what they don't want).
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
for (const f of readdirSync('supabase/migrations').sort().filter((f) => !f.includes('cron'))) {
  await db.query(readFileSync(`supabase/migrations/${f}`, 'utf8'));
}
// Time travel: today_local() reads app.today when set.
await db.query(`
  create or replace function public.today_local() returns date language sql stable security definer set search_path = public as
  $$ select coalesce(nullif(current_setting('app.today', true), '')::date, (now() at time zone 'Asia/Kolkata')::date) $$;
`);

let TODAY = '2026-01-01';

/** Run SQL as a user (RLS applies) on the simulated date. */
async function as(uid, sql, params = []) {
  const c = await db.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('app.today', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [TODAY, uid ?? '']);
    if (uid) await c.query('set local role authenticated');
    const r = await c.query(sql, params);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally { c.release(); }
}
const sys = (sql, params) => as(null, sql, params); // postgres/cron context
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };

const stats = { applied: 0, auto: 0, extra: 0, rejectedBiz: 0, approvedExtra: 0, rejectedExtra: 0, cancelled: 0, refunds: 0, halfDays: 0, grants: 0, invariantChecks: 0, bizErrors: {} };
const bugs = [];
function bug(msg, extra) { bugs.push(msg + (extra ? ` :: ${JSON.stringify(extra)}` : '')); }

// ---------- personas ----------
let uidN = 0;
const newUid = () => `00000000-0000-0000-0000-${String(++uidN).padStart(12, '0')}`;
const P = {};
async function persona(key, { name, role = 'employee', category, joined, alloc }) {
  const uid = newUid();
  const email = `${key}@editsimple.in`;
  await sys(`insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1,$2,$3,$4)`,
    [uid, email, JSON.stringify(role === 'employee' ? {} : { role }), JSON.stringify({ full_name: name })]);
  P[key] = { key, uid, name, role, category, joined, alloc };
  return P[key];
}
await persona('ishpreet', { name: 'Ishpreet Singh', role: 'superadmin', category: 'office', joined: '2024-04-01', alloc: [1, 1.5, 2] });
await persona('neha', { name: 'Neha Admin', role: 'admin', category: 'office', joined: '2025-01-10', alloc: [1, 1.5, 4] });
await persona('asha', { name: 'Asha Rao', category: 'office', joined: '2025-06-01', alloc: [1.5, 1.5, 2] });
await persona('ravi', { name: 'Ravi Kumar', category: 'office', joined: '2024-02-15', alloc: [1, 2, 8] });
await persona('zoya', { name: 'Zoya Khan', category: 'permanent_wfh', joined: '2025-09-01', alloc: [1, 1.5, 5] });
await persona('kabir', { name: 'Kabir Mehta', category: 'office', joined: '2026-03-17', alloc: [1, 1, 4] });
await persona('meera', { name: 'Meera Iyer', category: 'office', joined: '2023-01-01', alloc: [1, 2.5, 0] });
await persona('arjun', { name: 'Arjun Das', category: 'office', joined: '2025-01-01', alloc: [1, 1.5, 1] });
const SA = P.ishpreet.uid, AD = P.neha.uid;
const EMPS = ['asha', 'ravi', 'zoya', 'kabir', 'meera', 'arjun', 'neha', 'ishpreet'];

// Holidays (2026 fixed list from the owner) + a weekend config of Sat/Sun.
const HOLIDAYS = [['2026-01-01', "New Year's Day"], ['2026-01-26', 'Republic Day'], ['2026-04-03', 'Good Friday'],
  ['2026-05-01', 'Maharashtra Day'], ['2026-09-14', 'Ganesh Chaturthi'], ['2026-10-02', 'Gandhi Jayanti'],
  ['2026-11-10', 'Diwali Padwa'], ['2026-12-25', 'Christmas'], ['2027-01-01', "New Year's Day"]];
for (const [d, n] of HOLIDAYS) await as(SA, `insert into holidays (holiday_date, name) values ($1,$2)`, [d, n]);

// Employees + allocations are set up on their joining date (or Jan 1 for existing staff).
async function onboard(p) {
  const r = await as(SA, `insert into employees (profile_id, employee_code, full_name, email, joining_date, category)
    values ($1, $2, $3, $4, $5, $6) returning id`, [p.uid, `ES-${p.key.toUpperCase()}`, p.name, `${p.key}@editsimple.in`, p.joined, p.category]);
  p.emp = r.rows[0].id;
  const res = (await as(SA, `select set_allocation($1,$2,$3,$4) r`, [p.emp, ...p.alloc])).rows[0].r;
  p.onboardResult = res;
}

// ---------- helpers ----------
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();
const isWorking = (s) => dow(s) !== 0 && dow(s) !== 6 && !HOLIDAYS.some(([h]) => h === s);

async function bal(p) {
  const r = (await sys(`select casual::float c, earned::float e, wfh::float w, casual_year, wfh_month::text wm from leave_balances where employee_id=$1`, [p.emp])).rows[0];
  return r;
}
async function apply(p, type, start, end, { half = false, session = null, reason = '', raise = false } = {}) {
  return (await as(p.uid, `select apply_leave($1::leave_type, $2::date, $3::date, $4, $5, $6, $7) j`, [type, start, end, reason, half, session, raise])).rows[0].j;
}

// ---------- invariants ----------
async function checkInvariants(label) {
  stats.invariantChecks++;
  // I1 cached balance == ledger sum
  const i1 = (await sys(`
    select e.full_name, t.lt, coalesce(s.sum,0)::float ledger,
           case t.lt when 'casual' then b.casual when 'earned' then b.earned else b.wfh end::float cached
    from employees e join leave_balances b on b.employee_id=e.id
    cross join (values ('casual'::leave_type),('earned'),('wfh')) t(lt)
    left join lateral (select sum(amount) sum from leave_transactions x where x.employee_id=e.id and x.leave_type=t.lt) s on true
    where coalesce(s.sum,0) <> case t.lt when 'casual' then b.casual when 'earned' then b.earned else b.wfh end`)).rows;
  if (i1.length) bug(`[${label}] I1 cached balance != ledger`, i1);
  // I2 balance_after chain
  const i2 = (await sys(`
    select employee_id, leave_type, id, balance_after::float, running::float from (
      select *, sum(amount) over (partition by employee_id, leave_type order by id) running from leave_transactions) z
    where balance_after <> running limit 5`)).rows;
  if (i2.length) bug(`[${label}] I2 balance_after chain broken`, i2);
  // I4 approved requests: exactly one debit = full days (0010: balances may go negative)
  const i4 = (await sys(`
    select r.id, r.days::float, r.extra_days::float, count(t.id) n, sum(t.amount)::float amt
    from leave_requests r left join leave_transactions t on t.request_id=r.id and t.kind='debit'
    where r.status='approved' and r.leave_type::text <> 'unpaid' group by r.id having count(t.id) <> 1 or sum(t.amount) <> -r.days`)).rows;
  if (i4.length) bug(`[${label}] I4 approved request debit mismatch`, i4);
  // I5 at most one debit and one refund per request; refunds only on cancelled
  const i5 = (await sys(`
    select request_id, kind, count(*) from leave_transactions where request_id is not null
    group by request_id, kind having count(*) > 1`)).rows;
  if (i5.length) bug(`[${label}] I5 duplicate ledger lines per request`, i5);
  const i5b = (await sys(`select r.id, r.status from leave_requests r join leave_transactions t on t.request_id=r.id and t.kind='adjustment' where r.status <> 'cancelled'`)).rows;
  if (i5b.length) bug(`[${label}] I5b refund on non-cancelled request`, i5b);
  // I7 monthly EL credit never takes balance above cap
  const i7 = (await sys(`select id, amount::float, balance_after::float from leave_transactions where kind='monthly_credit' and leave_type='earned' and amount > 0 and balance_after > 20`)).rows;
  if (i7.length) bug(`[${label}] I7 EL monthly credit exceeded cap`, i7);
  // I8 WFH monthly credit never carries a positive leftover (a shortfall may reduce it)
  const i8 = (await sys(`select id, amount::float, balance_after::float from leave_transactions where kind='monthly_credit' and leave_type='wfh' and balance_after > amount`)).rows;
  // I9 floors (policy v2): CL/EL never below 0, WFH never below -10
  const i9 = (await sys(`select employee_id from leave_balances where casual < 0 or earned < 0 or wfh < -10`)).rows;
  const i9b = (await sys(`select id from leave_transactions where (leave_type <> 'wfh' and balance_after < 0) or balance_after < -10`)).rows;
  if (i9b.length) bug(`[${label}] I9b ledger line below floor`, i9b);
  // I18 unpaid leave never touches the ledger; approved unpaid has no extra_days
  const i18 = (await sys(`select t.id from leave_transactions t join leave_requests r on r.id=t.request_id where r.leave_type::text='unpaid'`)).rows;
  if (i18.length) bug(`[${label}] I18 unpaid leave hit the ledger`, i18);
  // I19 revoked grants: the ledger lines linked to a grant sum to (days - taken back) for positive grants
  const i19 = (await sys(`select g.id, g.days::float, g.revoked_days::float, sum(t.amount)::float s from special_grants g
    join leave_transactions t on t.grant_id=g.id where g.revoked_at is not null
    group by g.id having sum(t.amount) <> g.days - sign(g.days) * coalesce(g.revoked_days,0)`)).rows;
  if (i19.length) bug(`[${label}] I19 revoked grant ledger mismatch`, i19);
  // I20 no hybrid employees
  const i20 = (await sys(`select id from employees where category::text='hybrid'`)).rows;
  if (i20.length) bug(`[${label}] I20 hybrid employee exists`, i20);
  if (i9.length) bug(`[${label}] I9 balance below floor`, i9);
  if (i8.length) bug(`[${label}] I8 WFH carried forward`, i8);
  // I10 permanent WFH employees never have WFH requests
  const i10 = (await sys(`select r.id from leave_requests r join employees e on e.id=r.employee_id where e.category='permanent_wfh' and r.leave_type='wfh'`)).rows;
  if (i10.length) bug(`[${label}] I10 permanent WFH has WFH request`, i10);
  // I13 days = working days (or 0.5)
  const i13 = (await sys(`select id, days::float, working_days(start_date,end_date) wd, half_day from leave_requests
    where (half_day and days <> 0.5) or (not half_day and days <> working_days(start_date,end_date))`)).rows;
  // Note: holidays are fixed in this sim, so this must hold.
  if (i13.length) bug(`[${label}] I13 days != working days`, i13);
  // I14 pending requests are all extra-day requests
  const i14 = (await sys(`select id from leave_requests where status='pending' and not is_extra and leave_type::text <> 'unpaid'`)).rows;
  if (i14.length) bug(`[${label}] I14 non-extra pending request`, i14);
  // I15 no request before joining date
  const i15 = (await sys(`select r.id from leave_requests r join employees e on e.id=r.employee_id where r.start_date < e.joining_date`)).rows;
  if (i15.length) bug(`[${label}] I15 request before joining`, i15);
  // I17 overlapping live requests (constraint should make this impossible)
  const i17 = (await sys(`select a.id from leave_requests a join leave_requests b on a.employee_id=b.employee_id and a.id<b.id
    and a.status in ('pending','approved') and b.status in ('pending','approved') and daterange(a.start_date,a.end_date,'[]') && daterange(b.start_date,b.end_date,'[]')`)).rows;
  if (i17.length) bug(`[${label}] I17 overlapping live requests`, i17);
}

let n = 0;
const ok = (m) => console.log(`  ✓ ${String(++n).padStart(2)}. ${m}`);
const BIZ = new Set(['P0001']);

// =====================================================================
// Part 1 — scripted scenarios
// =====================================================================
console.log('\nPart 1 — scripted scenarios');

TODAY = '2026-01-01';
for (const k of ['ishpreet', 'neha', 'asha', 'ravi', 'zoya', 'meera', 'arjun']) await onboard(P[k]);
assert.equal(P.asha.onboardResult, 'credited');
assert.deepEqual([(await bal(P.asha)).c, (await bal(P.asha)).e, (await bal(P.asha)).w], [1.5, 1.5, 2]);
assert.equal((await bal(P.zoya)).w, 0);
ok('onboarding on 1 Jan credits the month; Permanent WFH gets 0 WFH');

await sys(`select run_monthly_accrual()`); await sys(`select run_monthly_accrual()`);
assert.equal((await bal(P.asha)).c, 1.5);
ok('daily cron re-runs on 1 Jan do not double-credit');

TODAY = '2026-01-05'; // Monday
let e = await err(apply(P.asha, 'casual', '2026-01-06', '2026-01-07'));
assert.match(e?.message ?? '', /Unpaid leave/);
let r = await apply(P.asha, 'casual', '2026-01-06', '2026-01-06', { reason: 'Dentist' });
assert.equal(r.status, 'approved'); assert.equal((await bal(P.asha)).c, 0.5);
ok('Asha: 2 CL with 1.5 balance blocked (suggests Unpaid); 1 day auto-approved and deducted');

r = await apply(P.asha, 'casual', '2026-01-07', '2026-01-07', { half: true, session: 'first' });
assert.equal(r.status, 'approved'); assert.equal((await bal(P.asha)).c, 0);
e = await err(apply(P.asha, 'casual', '2026-01-07', '2026-01-07', { half: true, session: 'second' }));
assert.match(e?.message ?? '', /overlap/);
ok('Asha: half-day uses 0.5; second half on same date is blocked (known limitation)');

e = await err(apply(P.asha, 'casual', '2026-01-08', '2026-01-09', { raise: true, reason: 'Family function' }));
assert.match(e?.message ?? '', /Unpaid leave/);
assert.equal((await bal(P.asha)).c, 0);
ok('Asha: CL beyond balance can no longer be "raised" — CL never goes negative');

e = await err(apply(P.asha, 'unpaid', '2026-01-08', '2026-01-09'));
assert.match(e?.message ?? '', /reason/);
const up1 = await apply(P.asha, 'unpaid', '2026-01-08', '2026-01-09', { reason: 'Family function' });
assert.equal(up1.status, 'pending'); assert.equal(+up1.days, 2);
e = await err(as(AD, `select decide_request($1, true, '')`, [up1.id]));
assert.match(e?.message ?? '', /Only a Superadmin/);
e = await err(as(P.asha.uid, `select decide_request($1, true, '')`, [up1.id]));
assert.ok(e);
const ledgerBefore = (await sys(`select count(*)::int c from leave_transactions where employee_id=$1`, [P.asha.emp])).rows[0].c;
await as(SA, `select decide_request($1, true, 'ok, salary deducted')`, [up1.id]);
const x1 = (await sys(`select status from leave_requests where id=$1`, [up1.id])).rows[0];
assert.equal(x1.status, 'approved');
assert.deepEqual([(await bal(P.asha)).c, (await bal(P.asha)).e], [0, 1.5]);
assert.equal((await sys(`select count(*)::int c from leave_transactions where employee_id=$1`, [P.asha.emp])).rows[0].c, ledgerBefore);
const ov = (await as(SA, `select unpaid_month::float m, unpaid_year::float y from leave_overview where employee_id=$1`, [P.asha.emp])).rows[0];
assert.deepEqual([ov.m, ov.y], [2, 2]);
const hro = (await as(SA, `select hr_overview() j`)).rows[0].j;
assert.equal(+hro.unpaid_month, 2);
ok('Unpaid leave: needs reason, always pending, only Superadmin approves, no balance change, counted for salary (2 days)');

const up2 = await apply(P.asha, 'unpaid', '2026-01-19', '2026-01-19', { reason: 'Personal' });
const scal = (await as(SA, `select leave_type from team_calendar('2026-01-01','2026-01-31') where full_name='Asha Rao'`)).rows.map((x) => x.leave_type);
assert.ok(scal.includes('unpaid'));
await as(SA, `select decide_request($1, true, '')`, [up2.id]);
const cu = (await as(P.asha.uid, `select cancel_request($1) j`, [up2.id])).rows[0].j;
assert.equal(+cu.refunded, 0);
ok('Unpaid leave shows on staff calendar; cancelling approved unpaid works with nothing to refund');

e = await err(as(SA, `insert into employees (employee_code, full_name, email, joining_date, category) values ('X1','X','x@editsimple.in','2026-01-01','hybrid')`));
assert.match(e?.message ?? '', /two_categories/);
ok('only two categories: Office/Hybrid and Permanent WFH ("hybrid" rejected)');

e = await err(apply(P.zoya, 'wfh', '2026-01-06', '2026-01-06'));
assert.match(e?.message ?? '', /Permanent WFH/);
ok('Zoya (Permanent WFH) cannot request WFH');

r = await apply(P.ravi, 'wfh', '2026-01-12', '2026-01-16');
assert.equal(r.status, 'approved'); assert.equal((await bal(P.ravi)).w, 3);
e = await err(apply(P.ravi, 'wfh', '2026-02-02', '2026-02-02'));
assert.match(e?.message ?? '', /current month/);
e = await err(apply(P.ravi, 'wfh', '2026-01-02', '2026-01-02'));
assert.match(e?.message ?? '', /past dates/);
ok('Ravi: 5-day WFH auto-approved (8→3); next-month and past WFH blocked');

e = await err(apply(P.ravi, 'earned', '2026-01-24', '2026-01-25'));
assert.match(e?.message ?? '', /no working days/);
r = await apply(P.ravi, 'earned', '2026-01-23', '2026-01-27');
assert.equal(+r.days, 2); // Fri 23, Sat, Sun, Mon 26 holiday, Tue 27
ok('weekends & Republic Day excluded from day count');

const before = (await bal(P.ravi)).e;
const cx = (await as(P.ravi.uid, `select cancel_request($1) j`, [r.id])).rows[0].j;
assert.equal(+cx.refunded, 2); assert.equal((await bal(P.ravi)).e, before + 2);
e = await err(as(P.ravi.uid, `select cancel_request($1) j`, [r.id]));
assert.match(e?.message ?? '', /already cancelled/);
ok('Ravi cancels approved future leave → 2 EL refunded exactly once');

TODAY = '2026-01-12';
const wfhReq = (await sys(`select id from leave_requests where employee_id=$1 and leave_type='wfh' and status='approved'`, [P.ravi.emp])).rows[0].id;
e = await err(as(P.ravi.uid, `select cancel_request($1)`, [wfhReq]));
assert.match(e?.message ?? '', /already started/);
ok('leave that already started cannot be cancelled');

e = await err(as(P.meera.uid, `select cancel_request($1)`, [wfhReq]));
assert.match(e?.message ?? '', /not found/);
const peek = (await as(P.meera.uid, `select count(*)::int c from leave_requests`)).rows[0].c;
const peekBal = (await as(P.meera.uid, `select count(*)::int c from leave_balances`)).rows[0].c;
assert.equal(peek, 0); assert.equal(peekBal, 1);
const mcal = (await as(P.meera.uid, `select * from team_calendar('2026-01-01','2026-01-31')`)).rows;
assert.ok(mcal.length > 0 && mcal.every((r) => r.employee_id === null && ['leave', 'wfh'].includes(r.leave_type)));
ok('Meera cannot see or cancel others’ requests; team calendar shows only names + leave/WFH');

// Concurrency: two parallel applications that together exceed balance
TODAY = '2026-01-13';
await sys(`update leave_balances set casual = 1 where employee_id=$1`, [P.meera.emp]);
await sys(`insert into leave_transactions (employee_id, leave_type, kind, amount, balance_after, note) values ($1,'casual','adjustment',
  1 - (select coalesce(sum(amount),0) from leave_transactions where employee_id=$1 and leave_type='casual'), 1, 'test normalise')`, [P.meera.emp]);
const results = await Promise.allSettled([
  apply(P.meera, 'casual', '2026-01-14', '2026-01-14'),
  apply(P.meera, 'casual', '2026-01-15', '2026-01-15'),
]);
const okCount = results.filter((x) => x.status === 'fulfilled' && x.value.status === 'approved').length;
assert.equal(okCount, 1, JSON.stringify(results.map((x) => x.status === 'fulfilled' ? x.value : x.reason.message)));
assert.equal((await bal(P.meera)).c, 0);
ok('race: two simultaneous 1-day CL applications with 1 day balance → exactly one approved');

// Deactivation
await as(SA, `select set_employee_status($1, 'inactive')`, [P.arjun.emp]);
const pendArjun = (await sys(`select count(*)::int c from leave_requests where employee_id=$1 and status='pending'`, [P.arjun.emp])).rows[0].c;
assert.equal(pendArjun, 0);
e = await err(apply(P.arjun, 'casual', '2026-01-20', '2026-01-20'));
assert.ok(e);
ok('Arjun deactivated: cannot apply');

// Special grant
await as(SA, `select grant_special($1, 'earned', 3, 'Comp-off for weekend shoot')`, [P.asha.emp]);
assert.equal((await bal(P.asha)).e, 4.5);
e = await err(as(AD, `select grant_special($1, 'earned', 3, 'x')`, [P.asha.emp]));
assert.ok(e);
ok('Superadmin grants 3 EL comp-off; Admin cannot grant');

// Grant 10 EL, employee uses 8, then HR revokes → only the unused part comes back
await as(SA, `select grant_special($1, 'earned', 10, 'Project bonus')`, [P.meera.emp]);
assert.equal((await bal(P.meera)).e, 12.5);
const g10 = (await sys(`select id from special_grants where employee_id=$1 and days=10`, [P.meera.emp])).rows[0].id;
const ml = await apply(P.meera, 'earned', '2026-02-02', '2026-02-11');
assert.equal(ml.status, 'approved'); assert.equal(+ml.days, 8); assert.equal((await bal(P.meera)).e, 4.5);
const rv = (await as(SA, `select revoke_special_grant($1) j`, [g10])).rows[0].j;
assert.deepEqual([+rv.taken_back, +rv.already_used], [4.5, 5.5]);
assert.equal((await bal(P.meera)).e, 0);
assert.equal((await sys(`select status from leave_requests where id=$1`, [ml.id])).rows[0].status, 'approved');
e = await err(as(SA, `select revoke_special_grant($1)`, [g10]));
assert.match(e?.message ?? '', /already revoked/);
ok('Grant 10 EL → employee books 8 → revoke takes back the unused 4.5 (5.5 already used stay approved); balance 0, never negative');

const mc = (await as(P.meera.uid, `select cancel_request($1) j`, [ml.id])).rows[0].j;
assert.deepEqual([+mc.refunded, +mc.clawed_back], [2.5, 5.5]); assert.equal((await bal(P.meera)).e, 2.5);
assert.equal(+(await sys(`select revoked_days::float r from special_grants where id=$1`, [g10])).rows[0].r, 10);
ok('…if she then cancels that leave, only her own 2.5 days come back; the 5.5 grant days are clawed back (no loophole)');

// Deductions (negative grants)
await as(SA, `select grant_special($1, 'earned', -2, 'Unauthorised absence')`, [P.asha.emp]);
assert.equal((await bal(P.asha)).e, 2.5);
e = await err(as(SA, `select grant_special($1, 'earned', -5, 'x')`, [P.asha.emp]));
assert.match(e?.message ?? '', /only 2.5 available/);
e = await err(as(AD, `select grant_special($1, 'earned', -1, 'x')`, [P.asha.emp]));
assert.ok(e);
e = await err(as(SA, `select grant_special($1, 'unpaid', 1, 'x')`, [P.asha.emp]));
assert.match(e?.message ?? '', /no balance/);
const gd = (await sys(`select id from special_grants where employee_id=$1 and days=-2`, [P.asha.emp])).rows[0].id;
e = await err(as(SA, `select update_special_grant($1, 2, 'flip')`, [gd]));
assert.match(e?.message ?? '', /deduction/);
await as(SA, `select update_special_grant($1, -1, 'Unauthorised absence (half)')`, [gd]);
assert.equal((await bal(P.asha)).e, 3.5);
const rd = (await as(SA, `select revoke_special_grant($1) j`, [gd])).rows[0].j;
assert.equal(+rd.taken_back, 1); assert.equal((await bal(P.asha)).e, 4.5);
ok('Deduct: −2 EL; can’t deduct more than available; Admin can’t; edit −2→−1; revoke returns the day');

// Edit a positive grant down only as far as unused
await as(SA, `select grant_special($1, 'casual', 3, 'Festival')`, [P.ravi.emp]);
const gr = (await sys(`select id from special_grants where employee_id=$1 and leave_type='casual' and days=3`, [P.ravi.emp])).rows[0].id;
const rc0 = (await bal(P.ravi)).c;
await as(SA, `select update_special_grant($1, 1, 'Festival')`, [gr]);
assert.equal((await bal(P.ravi)).c, rc0 - 2);
ok('Edit grant 3 → 1 CL removes 2 days');

await checkInvariants('scripted');
ok(`invariants hold after scripted scenarios${bugs.length ? ` (${bugs.length} issues!)` : ''}`);

// =====================================================================
// Part 2 — full-year simulation with random AI employee behaviour
// =====================================================================
console.log(`\nPart 2 — full-year simulation (seed ${SEED})`);
for (const k of EMPS) {
  if (P[k].emp && P[k].key !== 'arjun') await sys(`update leave_balances set casual=casual where employee_id=$1`, [P[k].emp]);
}

const unexpected = [];
for (let day = '2026-01-14'; day <= '2027-01-20'; day = addDays(day, 1)) {
  TODAY = day;
  if (day === P.kabir.joined) await onboard(P.kabir);
  if (day === '2026-07-01') await as(SA, `select set_allocation($1, 1.5, 2, 3)`, [P.asha.emp]); // mid-year allocation change

  await sys(`select run_monthly_accrual()`);                 // daily cron (00:05 IST)
  if (day.endsWith('-12-31')) await sys(`select run_year_end_expiry()`);

  if (!isWorking(day)) continue;

  for (const k of EMPS) {
    const p = P[k];
    if (!p.emp || k === 'arjun') continue;
    if (chance(Number(process.env.APPLY_P ?? 0.09))) {
      const type = p.category === 'permanent_wfh' ? pick(['casual', 'earned', 'casual', 'earned', 'unpaid']) : pick(['casual', 'earned', 'wfh', 'wfh', 'unpaid']);
      let start = type === 'wfh' ? addDays(day, Math.floor(rand() * 8)) : addDays(day, Math.floor(rand() * 25) - (chance(0.1) ? 10 : 0));
      if (type === 'wfh' && start.slice(0, 7) !== day.slice(0, 7)) start = day;
      const len = chance(0.6) ? 0 : Math.floor(rand() * 4);
      let end = addDays(start, len);
      if (type === 'wfh' && end.slice(0, 7) !== day.slice(0, 7)) end = start;
      const half = len === 0 && chance(0.25);
      const raise = chance(0.35);
      try {
        const res = await apply(p, type, start, end, { half, session: half ? pick(['first', 'second']) : null, raise, reason: raise || (type === 'unpaid' && chance(0.9)) ? 'Need extra days' : '' });
        stats.applied++;
        if (res.status === 'approved') stats.auto++; else stats.extra++;
        if (half) stats.halfDays++;
      } catch (ex) {
        if (BIZ.has(ex.code)) { stats.rejectedBiz++; const key = ex.message.replace(/[\d.]+/g, '#'); stats.bizErrors[key] = (stats.bizErrors[key] ?? 0) + 1; }
        else unexpected.push({ day, who: k, type, start, end, half, raise, code: ex.code, msg: ex.message });
      }
    }
    if (chance(Number(process.env.CANCEL_P ?? 0.03))) {
      const mine = (await as(p.uid, `select id, status, start_date::text s from leave_requests where employee_id = $1 and status in ('pending','approved') order by random() limit 1`, [p.emp])).rows[0];
      if (mine) {
        try {
          const c = (await as(p.uid, `select cancel_request($1) j`, [mine.id])).rows[0].j;
          stats.cancelled++; if (+c.refunded > 0) stats.refunds++;
        } catch (ex) {
          if (!BIZ.has(ex.code)) unexpected.push({ day, who: k, action: 'cancel', code: ex.code, msg: ex.message });
          else if (!(mine.status === 'approved' && mine.s <= day)) unexpected.push({ day, who: k, action: 'cancel-should-work', msg: ex.message });
        }
      }
    }
  }

  // Superadmin works through extra-day requests
  if (chance(0.5)) {
    const pend = (await as(SA, `select id, employee_id from leave_requests where status='pending' order by start_date`)).rows;
    for (const q of pend) {
      if (q.employee_id === P.ishpreet.emp) {
        const ex = await err(as(SA, `select decide_request($1, true, '')`, [q.id]));
        if (!ex) unexpected.push({ day, action: 'self-approval allowed' });
        // Self requests are left for "another approver" — in this sim, reject via a second path isn't available.
        continue;
      }
      try {
        const approve = chance(0.6);
        await as(SA, `select decide_request($1, $2, $3)`, [q.id, approve, approve ? 'ok' : 'busy period']);
        approve ? stats.approvedExtra++ : stats.rejectedExtra++;
      } catch (ex) { unexpected.push({ day, action: 'decide', code: ex.code, msg: ex.message }); }
    }
  }
  if (chance(0.01)) {
    const k = pick(['asha', 'ravi', 'meera', 'kabir']);
    if (P[k].emp) { await as(SA, `select grant_special($1, $2, 1, 'Spot award')`, [P[k].emp, pick(['casual', 'earned'])]); stats.grants++; }
  }
  if (chance(Number(process.env.GRANT_P ?? 0.03))) {   // HR grants a block, deducts, edits or revokes
    const k = pick(['asha', 'ravi', 'meera', 'kabir', 'zoya']);
    const op = pick(['grant', 'grant', 'deduct', 'revoke', 'revoke', 'edit']);
    if (P[k].emp) try {
      if (op === 'grant') await as(SA, `select grant_special($1, $2, $3, 'Block grant')`, [P[k].emp, pick(['casual', 'earned']), pick([2, 5, 10])]);
      if (op === 'deduct') await as(SA, `select grant_special($1, $2, $3, 'Deduction')`, [P[k].emp, pick(['casual', 'earned']), -pick([0.5, 1, 3])]);
      const g = (await sys(`select id, days::float d from special_grants where employee_id=$1 and revoked_at is null order by random() limit 1`, [P[k].emp])).rows[0];
      if (g && op === 'revoke') { await as(SA, `select revoke_special_grant($1)`, [g.id]); stats.revokes = (stats.revokes ?? 0) + 1; }
      if (g && op === 'edit') await as(SA, `select update_special_grant($1, $2, 'edited')`, [g.id, g.d > 0 ? Math.max(0.5, g.d - 1) : g.d - 0.5]);
      stats.grantOps = (stats.grantOps ?? 0) + 1;
    } catch (ex) {
      if (BIZ.has(ex.code)) { const key = 'GRANT: ' + ex.message.replace(/[\d.]+/g, '#'); stats.bizErrors[key] = (stats.bizErrors[key] ?? 0) + 1; }
      else unexpected.push({ day, action: 'grant-' + op, code: ex.code, msg: ex.message });
    }
  }

  if (day.endsWith('-01') || day.endsWith('-15') || day === '2027-01-20') await checkInvariants(day);
}

// Year-end expectations
TODAY = '2027-01-20';
const exp = (await sys(`select e.full_name, count(t.id) n from employees e
  left join leave_transactions t on t.employee_id=e.id and t.leave_type='casual' and t.kind='expiry' and t.period='2026-01-01'
  where e.status='active' group by e.full_name having count(t.id) <> 1`)).rows;
if (exp.length) bug('CL 2026 expiry missing or duplicated', exp);
const janCL = (await sys(`select e.full_name, b.casual::float, b.casual_year from employees e join leave_balances b on b.employee_id=e.id
  where e.status='active' and (b.casual_year is distinct from 2027)`)).rows;
if (janCL.length) bug('CL year not rolled to 2027', janCL);
const stalePendingWfh = (await sys(`select count(*)::int c from leave_requests where leave_type='wfh' and status='pending' and start_date < '2027-01-01'`)).rows[0].c;
if (stalePendingWfh) bug('stale WFH pending requests from ended months', stalePendingWfh);
const elOver = (await sys(`select e.full_name, b.earned::float from employees e join leave_balances b on b.employee_id=e.id where b.earned > 20
  and not exists (select 1 from leave_transactions t where t.employee_id=e.id and t.leave_type='earned' and t.kind in ('special_grant','adjustment'))`)).rows;
if (elOver.length) bug('EL above 20 without grant/refund', elOver);
const kabirFirst = (await sys(`select period::text, amount::float from leave_transactions where employee_id=$1 and kind='monthly_credit' and leave_type='casual' order by period limit 1`, [P.kabir.emp])).rows[0];
if (kabirFirst?.period !== '2026-03-01') bug('new joiner (17 Mar) did not get March credit on onboarding', kabirFirst);
const arjunCredits = (await sys(`select count(*)::int c from leave_transactions where employee_id=$1 and kind='monthly_credit' and period > '2026-01-01'`, [P.arjun.emp])).rows[0].c;
if (arjunCredits) bug('deactivated employee kept receiving credits', arjunCredits);
const ashaJul = (await sys(`select amount::float from leave_transactions where employee_id=$1 and kind='monthly_credit' and leave_type='casual' and period='2026-07-01'`, [P.asha.emp])).rows[0];
if (ashaJul?.amount !== 1.5) bug('July allocation change not applied from next credit', ashaJul);


// =====================================================================
// Part 3 — the owner's worked example (1 CL, 1 EL, 4 WFH; Oct 2026 → Jan 2027)
// =====================================================================
console.log('\nPart 3 — owner example (1/1/4 from 1 Oct 2026)');
await persona('owner', { name: 'Owner Example', category: 'office', joined: '2026-10-01', alloc: [1, 1, 4] });
const O = P.owner;
TODAY = '2026-10-01'; await onboard(O);
const ob = async () => { const b = await bal(O); return [b.c, b.e, b.w]; };
assert.deepEqual(await ob(), [1, 1, 4]);
const approveAll = async () => { for (const q of (await as(SA, `select id from leave_requests where employee_id=$1 and status='pending'`, [O.emp])).rows) await as(SA, `select decide_request($1, true, 'ok')`, [q.id]); };

// October (policy v2): wants 2 CL / 2 EL / 6 WFH with 1 / 1 / 4
TODAY = '2026-10-05';
let e3 = await err(apply(O, 'casual', '2026-10-06', '2026-10-07', { raise: true, reason: 'Family' }));
assert.match(e3?.message ?? '', /Only 1 day\(s\) of Casual Leave available/);
await apply(O, 'casual', '2026-10-06', '2026-10-06');                                  // 1 CL auto
await apply(O, 'unpaid', '2026-10-07', '2026-10-07', { reason: 'Family' });             // rest as unpaid
await apply(O, 'earned', '2026-10-08', '2026-10-08');                                  // 1 EL auto
await apply(O, 'unpaid', '2026-10-09', '2026-10-09', { reason: 'Trip' });
await apply(O, 'wfh', '2026-10-12', '2026-10-15');                                     // 4 WFH auto
e3 = await err(apply(O, 'wfh', '2026-10-16', '2026-10-19'));
assert.match(e3?.message ?? '', /Raise a request to HR/);
await apply(O, 'wfh', '2026-10-16', '2026-10-19', { raise: true, reason: 'Home repairs' }); // 2 extra WFH
await approveAll();
assert.deepEqual(await ob(), [0, 0, -2]);
const oov = (await as(SA, `select unpaid_month::float m from leave_overview where employee_id=$1`, [O.emp])).rows[0];
assert.equal(oov.m, 2);
ok('Oct: CL/EL stop at 0 (extra taken as 2 unpaid days); WFH 6 → −2 via HR');

TODAY = '2026-11-01'; await sys(`select credit_monthly($1, '2026-11-01')`, [O.emp]);
assert.deepEqual(await ob(), [1, 1, 2]);
ok('1 Nov: CL 1, EL 1, WFH 4 − 2 = 2 (WFH shortfall taken from next month)');

TODAY = '2026-11-02';
await apply(O, 'wfh', '2026-11-16', '2026-11-19', { raise: true, reason: 'Internet install' }); // 4 with 2 left → −2
await approveAll();
assert.deepEqual(await ob(), [1, 1, -2]);
await apply(O, 'wfh', '2026-11-02', '2026-11-06', { raise: true, reason: 'Renovation' });      // 5 more → −7
await approveAll();
assert.deepEqual(await ob(), [1, 1, -7]);
e3 = await err(apply(O, 'wfh', '2026-11-20', '2026-11-25', { raise: true, reason: 'x' }));     // 4 working days → −11
assert.match(e3?.message ?? '', /limit of -10/);
await apply(O, 'wfh', '2026-11-20', '2026-11-23', { raise: true, reason: 'x' });               // 2 → −9
await approveAll();
assert.deepEqual(await ob(), [1, 1, -9]);
ok('Nov: WFH can go down to −10 with HR approval; going past −10 blocked');

TODAY = '2026-12-01'; await sys(`select credit_monthly($1, '2026-12-01')`, [O.emp]);
assert.deepEqual(await ob(), [2, 2, -5]);
ok('1 Dec: WFH −9 + 4 = −5 (shortfall carries until repaid)');
TODAY = '2026-12-31'; await sys(`select expire_casual($1, 2026)`, [O.emp]);
TODAY = '2027-01-01'; await sys(`select credit_monthly($1, '2027-01-01')`, [O.emp]);
assert.deepEqual(await ob(), [1, 3, -1]);
ok('Dec → Jan: unused CL expires (2 → 0, +1 = 1), EL carries (3), WFH −5 + 4 = −1');
await checkInvariants('owner-example');

for (const u of unexpected) bug('Unexpected (non-business) error', u);

console.log('\nSimulation stats:', JSON.stringify({ ...stats, bizErrors: undefined }, null, 0));
console.log('Business-rule rejections (expected):');
for (const [k, v] of Object.entries(stats.bizErrors).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(4)} × ${k}`);

const finalBal = (await sys(`select e.full_name, e.category, b.casual::float cl, b.earned::float el, b.wfh::float wfh from employees e join leave_balances b on b.employee_id=e.id order by e.full_name`)).rows;
console.table(finalBal);

await db.end();
if (bugs.length) {
  console.log(`\n✗ ${bugs.length} issue(s) found:`);
  for (const b of bugs) console.log('   -', b);
  process.exit(1);
}
console.log(`\n✓ All scripted scenarios passed and ${stats.invariantChecks} invariant sweeps were clean.`);
