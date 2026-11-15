// Runs the migrations against an in-memory Postgres (PGlite) with a stubbed
// Supabase `auth` schema, then checks RLS and constraints.
// Usage: node tests/db-foundation.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite({ extensions: { btree_gist } });

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  grant usage on schema public to authenticated, anon;
`);
for (const f of readdirSync('supabase/migrations').sort().filter((f) => !f.includes('cron'))) {
  await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
}
await db.exec(`
  grant select, insert, update, delete on all tables in schema public to authenticated;
  -- re-apply the migration's revokes (Supabase grants table privileges by default)
  revoke insert, update, delete on public.leave_balances, public.leave_requests, public.special_grants, public.leave_transactions from authenticated;
  revoke insert, delete on public.profiles, public.leave_allocations, public.app_settings from authenticated;
  revoke delete on public.employees from authenticated;
  revoke update on public.leave_allocations from authenticated;
`);

const SA = '00000000-0000-0000-0000-00000000000a';
const AD = '00000000-0000-0000-0000-00000000000b';
const E1 = '00000000-0000-0000-0000-00000000000c';
const E2 = '00000000-0000-0000-0000-00000000000d';
await db.exec(`
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
   ('${SA}', 'Boss@EditSimple.com', '{"role":"superadmin"}', '{"full_name":"Boss"}'),
   ('${AD}', 'hr@editsimple.com',   '{"role":"admin"}', '{}'),
   ('${E1}', 'e1@editsimple.com',   '{}', '{"role":"superadmin"}'),  -- user_metadata role must be ignored
   ('${E2}', 'e2@editsimple.com',   '{}', '{}');
  insert into public.employees (profile_id, employee_code, full_name, email, joining_date, category) values
   ('${E1}', 'ES-001', 'Emp One', 'e1@editsimple.com', '2025-01-01', 'office'),
   ('${E2}', 'ES-002', 'Emp Two', 'e2@editsimple.com', '2025-01-01', 'hybrid');
`);

async function as(uid, sql, params) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await db.query(sql, params); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function rejects(p, msg) {
  let ok = false; try { await p; } catch { ok = true; }
  assert.ok(ok, msg);
}
let n = 0; const ok = (m) => console.log(`  ✓ ${++n}. ${m}`);

// --- profiles / roles
const roles = (await db.query(`select email, role from profiles order by email`)).rows;
assert.deepEqual(roles.map(r => r.role), ['superadmin', 'employee', 'employee', 'admin']);
ok('profile created from auth user; role only from app_metadata; email lowercased');

assert.equal((await as(E1, `select * from profiles`)).rows.length, 1);
assert.equal((await as(AD, `select * from profiles`)).rows.length, 4);
ok('employee sees only own profile; admin sees all');

assert.equal((await as(AD, `update profiles set role='superadmin' where id='${AD}' returning id`)).rows.length, 0);
assert.equal((await as(E1, `update profiles set role='admin' where id='${E1}' returning id`)).rows.length, 0);
ok('admin/employee cannot change roles');

assert.equal((await as(SA, `update profiles set role='admin' where id='${E2}' returning id`)).rows.length, 1);
await as(SA, `update profiles set role='employee' where id='${E2}'`);
ok('superadmin can change roles');

await rejects(as(SA, `update profiles set role='employee' where id='${SA}'`), 'last superadmin');
ok('cannot demote the last active superadmin');

// --- employees
assert.equal((await as(E1, `select * from employees`)).rows.length, 1);
assert.equal((await as(AD, `select * from employees`)).rows.length, 2);
await rejects(as(AD, `insert into employees (employee_code, full_name, email, joining_date, category) values ('X','X','x@e.com','2025-01-01','office')`), 'admin insert');
assert.equal((await as(AD, `update employees set department='X' returning id`)).rows.length, 0);
ok('employees: self/staff read; only superadmin writes');

const empIds = (await db.query(`select id, employee_code from employees order by employee_code`)).rows;
const [e1, e2] = empIds.map(r => r.id);
assert.equal((await db.query(`select count(*)::int c from leave_allocations`)).rows[0].c, 2);
assert.equal((await db.query(`select count(*)::int c from leave_balances`)).rows[0].c, 2);
ok('allocation + balance rows auto-created');

// --- allocations
await rejects(as(AD, `select set_allocation('${e1}', 1, 1, 1)`), 'admin alloc');
await rejects(as(SA, `update leave_allocations set casual_per_month=9`), 'direct alloc update');
assert.equal((await as(SA, `select set_allocation('${e1}', 1.5, 1.5, 4) r`)).rows[0].r, 'credited');
assert.equal((await as(SA, `select set_allocation('${e1}', 2, 2, 4) r`)).rows[0].r, 'next_month');
await rejects(as(SA, `select set_allocation('${e1}', 1.3, 1, 1)`), 'bad step');
assert.equal((await as(E2, `select * from leave_allocations`)).rows.length, 1);
const ov = (await as(E1, `select casual, earned, wfh, casual_per_month from leave_overview`)).rows;
assert.equal(ov.length, 1); assert.deepEqual([+ov[0].casual, +ov[0].earned, +ov[0].wfh, +ov[0].casual_per_month], [1.5, 1.5, 4, 2]);
ok('allocations: only via set_allocation by superadmin; first save credits this month, later edits apply next month');

// --- read-only ledger/balances from API
await rejects(as(SA, `update leave_balances set casual=99`), 'balance write');
await rejects(as(E1, `insert into leave_requests (employee_id, leave_type, start_date, end_date, days) values ('${e1}','casual','2026-12-01','2026-12-01',1)`), 'req insert');
await rejects(as(SA, `insert into leave_transactions (employee_id, leave_type, kind, amount, balance_after, period) values ('${e1}','casual','monthly_credit',1,1,'2026-11-01')`), 'txn insert');
ok('balances/requests/ledger not writable from API, even by superadmin');

// --- constraints
await db.exec(`insert into leave_requests (employee_id, leave_type, start_date, end_date, days) values ('${e1}','casual','2026-12-01','2026-12-03',3)`);
await rejects(db.exec(`insert into leave_requests (employee_id, leave_type, start_date, end_date, days) values ('${e1}','wfh','2026-12-03','2026-12-03',1)`), 'overlap');
await db.exec(`insert into leave_requests (employee_id, leave_type, start_date, end_date, days) values ('${e2}','wfh','2026-12-03','2026-12-03',1)`);
await rejects(db.exec(`insert into leave_requests (employee_id, leave_type, start_date, end_date, days) values ('${e2}','wfh','2026-11-30','2026-12-01',2)`), 'wfh month');
await rejects(db.exec(`insert into leave_requests (employee_id, leave_type, start_date, end_date, days) values ('${e2}','casual','2026-12-31','2027-01-01',2)`), 'cl year');
ok('overlap blocked; WFH cannot cross month; CL cannot cross year');

await db.exec(`insert into leave_transactions (employee_id, leave_type, kind, amount, balance_after, period) values ('${e1}','casual','monthly_credit',1.5,1.5,'2020-01-01')`);
await rejects(db.exec(`insert into leave_transactions (employee_id, leave_type, kind, amount, balance_after, period) values ('${e1}','casual','monthly_credit',1.5,3,'2020-01-01')`), 'dup credit');
ok('duplicate monthly credit for same period rejected');

// --- working days (Sat/Sun weekend + holiday)
await db.exec(`insert into holidays (holiday_date, name) values ('2026-12-25', 'Christmas')`);
assert.equal((await db.query(`select working_days('2026-12-21','2026-12-27') d`)).rows[0].d, 4);
ok('working_days excludes weekends and holidays');

// --- anon
await rejects((async () => { await db.exec(`set role anon`); try { await db.query(`select * from employees`); } finally { await db.exec('reset role'); } })(), 'anon');
ok('anon has no table access');

// ===== Phase 2: employee management =====
await rejects(as(AD, `select set_employee_status('${e2}', 'inactive')`), 'admin status');
ok('admin cannot change employee status');

await as(SA, `select set_employee_status('${e2}', 'inactive')`);
const st = (await db.query(`select e.status, p.is_active, (select status from leave_requests where employee_id=e.id) rs
  from employees e join profiles p on p.id=e.profile_id where e.id='${e2}'`)).rows[0];
assert.deepEqual([st.status, st.is_active, st.rs], ['inactive', false, 'cancelled']);
ok('deactivate: employee inactive, login inactive, pending request auto-cancelled');

assert.equal((await as(E2, `select * from leave_balances`)).rows.length, 0);
ok('deactivated employee loses access to balances');

await as(SA, `select set_employee_status('${e2}', 'active')`);
assert.equal((await db.query(`select is_active from profiles where id='${E2}'`)).rows[0].is_active, true);
ok('reactivate restores login');

await db.exec(`insert into employees (profile_id, employee_code, full_name, email, joining_date, category) values ('${SA}','ES-000','Boss','boss@editsimple.com','2024-01-01','office')`);
const saEmp = (await db.query(`select id from employees where profile_id='${SA}'`)).rows[0].id;
await rejects(as(SA, `select set_employee_status('${saEmp}', 'inactive')`), 'self');
ok('superadmin cannot deactivate themselves');

await as(SA, `update employees set full_name='Emp One Renamed' where id='${e1}'`);
assert.equal((await db.query(`select full_name from profiles where id='${E1}'`)).rows[0].full_name, 'Emp One Renamed');
ok('employee name change syncs to profile');

// ===== Phase 3: balance engine =====
await db.exec(`insert into employees (employee_code, full_name, email, joining_date, category) values ('ES-004','Four','e4@editsimple.com','2025-10-01','hybrid')`);
const e4 = (await db.query(`select id from employees where employee_code='ES-004'`)).rows[0].id;
await db.exec(`update leave_allocations set casual_per_month=1, earned_per_month=8, wfh_per_month=3, configured_at=now() where employee_id='${e4}'`);
const bal = async () => { const r = (await db.query(`select casual, earned, wfh, casual_year, wfh_month from leave_balances where employee_id='${e4}'`)).rows[0];
  return [+r.casual, +r.earned, +r.wfh]; };
const txCount = async () => (await db.query(`select count(*)::int c from leave_transactions where employee_id='${e4}'`)).rows[0].c;
const credit = (m) => db.exec(`select credit_monthly('${e4}', '${m}')`);

await credit('2025-11-01');
assert.deepEqual(await bal(), [1, 8, 3]);
const c1 = await txCount();
await credit('2025-11-01'); await credit('2025-11-15');
assert.equal(await txCount(), c1); assert.deepEqual(await bal(), [1, 8, 3]);
ok('monthly credit applied once; re-runs in same month change nothing');

await credit('2025-12-01');
assert.deepEqual(await bal(), [2, 16, 3]);
assert.equal((await db.query(`select amount from leave_transactions where employee_id='${e4}' and leave_type='wfh' and kind='expiry'`)).rows[0].amount, '-3.0');
ok('CL & EL accumulate; unused WFH expires and resets (expiry recorded)');

await db.exec(`insert into leave_requests (employee_id, leave_type, start_date, end_date, days) values ('${e4}','casual','2025-12-29','2025-12-30',2)`);
await db.exec(`select run_year_end_expiry(2025)`); await db.exec(`select run_year_end_expiry(2025)`);
assert.deepEqual(await bal(), [0, 16, 3]);
assert.equal((await db.query(`select count(*)::int c from leave_transactions where employee_id='${e4}' and leave_type='casual' and kind='expiry'`)).rows[0].c, 1);
assert.equal((await db.query(`select status from leave_requests where employee_id='${e4}'`)).rows[0].status, 'rejected');
ok('31 Dec: CL expires once (idempotent), pending prior-year CL auto-rejected; EL untouched');

await credit('2026-01-01');
assert.deepEqual(await bal(), [1, 20, 3]);
ok('January: new CL year starts; EL partial credit fills exactly to 20');

await credit('2026-02-01');
assert.deepEqual(await bal(), [2, 20, 3]);
const capNote = (await db.query(`select amount, note from leave_transactions where employee_id='${e4}' and leave_type='earned' and period='2026-02-01'`)).rows[0];
assert.equal(+capNote.amount, 0); assert.match(capNote.note, /capped/);
ok('EL at cap: monthly credit is 0 and noted as capped');

const before = await txCount();
await credit('2025-09-01');
assert.deepEqual(await bal(), [2, 20, 3]);
ok('out-of-order (old month) run cannot disturb current CL/WFH');

// Missed Dec 31 job: Jan credit closes last year first
await db.exec(`insert into employees (employee_code, full_name, email, joining_date, category) values ('ES-005','Five','e5@editsimple.com','2025-01-01','office')`);
const e5 = (await db.query(`select id from employees where employee_code='ES-005'`)).rows[0].id;
await db.exec(`update leave_allocations set casual_per_month=2 where employee_id='${e5}'`);
await db.exec(`select credit_monthly('${e5}','2025-12-01'); select credit_monthly('${e5}','2026-01-01');`);
assert.equal(+(await db.query(`select casual from leave_balances where employee_id='${e5}'`)).rows[0].casual, 2);
ok('missed year-end run: January credit expires prior-year CL first');

await rejects(as(SA, `select run_monthly_accrual()`), 'cron fn');
await rejects(as(SA, `select credit_monthly('${e4}','2026-03-01')`), 'internal fn');
ok('batch/internal engine functions not callable from the API');

const n4 = (await db.query(`select run_monthly_accrual('2026-03-01') n`)).rows[0].n;
await db.exec(`select run_monthly_accrual('2026-03-01')`);
assert.ok(n4 >= 1); assert.deepEqual(await bal(), [3, 20, 3]);
ok('run_monthly_accrual is idempotent across all employees');

// ===== Phases 4–6: apply, approve, cancel, grants, overview =====
await db.exec(`update leave_requests set status='cancelled' where employee_id='${e1}' and status='pending'`);
await db.exec(`update leave_balances set casual=1.5, wfh=4 where employee_id='${e1}'`); // normalise after the back-dated runs above
const today = (await db.query(`select today_local()::text t`)).rows[0].t;
const wd = (await db.query(`select d::date::text d from generate_series($1::date, (date_trunc('month',$1::date)+interval '1 month -1 day')::date, '1 day') d
  where extract(dow from d) not in (0,6) and d::date not in (select holiday_date from holidays) order by d limit 2`, [today])).rows.map(r => r.d);
assert.equal(wd.length, 2, 'needs two working days left in this month to run these tests');
const [d1, d2] = wd;
const msg = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

assert.match(await msg(as(E1, `select apply_leave('casual', '${d1}', '${d2}', '')`)), /Not enough balance/);
const r1 = (await as(E1, `select apply_leave('casual', '${d1}', '${d1}', 'family') id`)).rows[0].id;
assert.match(await msg(as(E1, `select apply_leave('casual', '${d2}', '${d2}', '')`)), /Not enough balance/);
ok('apply: balance checked including other pending requests');

assert.match(await msg(as(E1, `select apply_leave('wfh', '${d1}', '${d1}', '')`)), /overlap/);
const r2 = (await as(E1, `select apply_leave('wfh', '${d2}', '${d2}', '') id`)).rows[0].id;
assert.match(await msg(as(E1, `select apply_leave('casual', '${d2}', '${d1}', '')`)), /End date/);
ok('apply: overlap and date-order validation');

assert.match(await msg(as(E1, `select decide_request('${r1}', true, '')`)), /Only Admins/);
await as(AD, `select decide_request('${r1}', true, 'ok')`);
assert.equal(+(await db.query(`select casual from leave_balances where employee_id='${e1}'`)).rows[0].casual, 0.5);
assert.match(await msg(as(AD, `select decide_request('${r1}', true, '')`)), /already approved/);
assert.equal((await db.query(`select count(*)::int c from leave_transactions where request_id='${r1}'`)).rows[0].c, 1);
ok('approve: deducts once; re-approval blocked; employees cannot approve');

assert.match(await msg(as(E1, `select cancel_request('${r1}')`)), /Only pending/);
await as(E1, `select cancel_request('${r2}')`);
assert.equal((await db.query(`select status from leave_requests where id='${r2}'`)).rows[0].status, 'cancelled');
assert.match(await msg(as(E2, `select cancel_request('${r1}')`)), /not found/);
ok('cancel: own pending only; no deduction for cancelled');

const r3 = (await as(E1, `select apply_leave('wfh', '${d2}', '${d2}', '') id`)).rows[0].id;
await as(SA, `select decide_request('${r3}', false, 'busy week')`);
assert.equal(+(await db.query(`select wfh from leave_balances where employee_id='${e1}'`)).rows[0].wfh, 4);
ok('reject: status updated, balance unchanged');

await as(SA, `select grant_special('${e1}', 'wfh', 2, 'Client travel')`);
await as(SA, `select grant_special('${e1}', 'casual', 3, 'Marriage leave')`);
const gb = (await db.query(`select casual, wfh from leave_balances where employee_id='${e1}'`)).rows[0];
assert.deepEqual([+gb.casual, +gb.wfh], [3.5, 6]);
assert.equal((await db.query(`select count(*)::int c from special_grants where employee_id='${e1}'`)).rows[0].c, 2);
assert.match(await msg(as(AD, `select grant_special('${e1}', 'casual', 1, 'x')`)), /Only a Superadmin/);
assert.match(await msg(as(SA, `select grant_special('${e1}', 'casual', 1, '  ')`)), /reason/);
ok('special grants: superadmin only, reason required, recorded separately + reflected in balance');

const ovw = (await as(AD, `select hr_overview() o`)).rows[0].o;
assert.ok(ovw.total >= 3 && 'pending_wfh' in ovw);
assert.match(await msg(as(E1, `select hr_overview()`)), /Not allowed/);
ok('HR overview: staff only');

await db.exec(`insert into employees (employee_code, full_name, email, joining_date, category) values ('ES-006','Six','e6@editsimple.com','2024-01-01','office')`);
const e6 = (await db.query(`select id from employees where employee_code='ES-006'`)).rows[0].id;
await db.exec(`select run_monthly_accrual()`);
assert.equal((await db.query(`select count(*)::int c from leave_transactions where employee_id='${e6}'`)).rows[0].c, 0);
assert.equal((await as(SA, `select set_allocation('${e6}', 1, 1, 2) r`)).rows[0].r, 'credited');
ok('monthly job skips never-configured allocations, so first save still credits the month');

console.log(`\nAll ${n} checks passed.`);
