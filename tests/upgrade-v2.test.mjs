// Upgrade path: a database on 0001–0012 with negative CL/EL, negative WFH and
// "hybrid" employees is upgraded with 0013 then 0014 (run separately, as in Supabase).
// Usage: PGHOST=/tmp PGUSER=postgres node tests/upgrade-v2.test.mjs
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const DB = 'hr_upgrade';
const admin = new pg.Client({ database: 'postgres' }); await admin.connect();
await admin.query(`do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$`);
await admin.query(`drop database if exists ${DB} with (force)`); await admin.query(`create database ${DB}`); await admin.end();
const db = new pg.Client({ database: DB }); await db.connect();
await db.query(`create extension if not exists btree_gist; create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
const files = readdirSync('supabase/migrations').sort().filter((f) => !f.includes('cron'));
for (const f of files.filter((f) => f < '0013')) await db.query(readFileSync(`supabase/migrations/${f}`, 'utf8'));
// Old-world data
await db.query(`insert into employees (employee_code, full_name, email, joining_date, category) values
  ('E1','Hy Brid','h@x.in','2025-01-01','hybrid'), ('E2','Off Ice','o@x.in','2025-01-01','office')`);
const [h, o] = (await db.query(`select id from employees order by employee_code`)).rows.map((r) => r.id);
const post = (emp, t, amt) => db.query(`select _post_txn($1, $2::leave_type, 'adjustment', $3, null, null, null, 'seed', null)`, [emp, t, amt]);
await post(h, 'casual', -3); await post(h, 'earned', -1.5); await post(h, 'wfh', -2); await post(o, 'casual', 2);
await db.query(`insert into special_grants (employee_id, leave_type, days, reason, granted_by) select $1, 'earned', 2, 'old', null where false`, [h]);
// Upgrade: each file is its own transaction (Supabase SQL editor run)
for (const f of files.filter((f) => f >= '0013')) await db.query(readFileSync(`supabase/migrations/${f}`, 'utf8'));
const b = (await db.query(`select e.employee_code c, e.category::text cat, casual::float, earned::float, wfh::float from employees e join leave_balances b on b.employee_id=e.id order by 1`)).rows;
assert.deepEqual(b, [
  { c: 'E1', cat: 'office', casual: 0, earned: 0, wfh: -2 },
  { c: 'E2', cat: 'office', casual: 2, earned: 0, wfh: 0 },
]);
const led = (await db.query(`select leave_type::text t, sum(amount)::float s from leave_transactions where employee_id=$1 group by 1 order by 1`, [h])).rows;
assert.deepEqual(led, [{ t: 'casual', s: 0 }, { t: 'earned', s: 0 }, { t: 'wfh', s: -2 }]);
const notes = (await db.query(`select note from leave_transactions where employee_id=$1 and note like 'Negative%' order by id`, [h])).rows.map((r) => r.note);
assert.equal(notes.length, 2);
// Re-running 0014 is safe (idempotent)
await db.query(readFileSync('supabase/migrations/0014_policy_v2.sql', 'utf8'));
assert.equal((await db.query(`select count(*)::int c from leave_transactions where note like 'Negative%'`)).rows[0].c, 2);
await db.end();
console.log('✓ upgrade: negative CL/EL cleared to 0 with ledger notes, WFH −2 kept, hybrid → office, 0014 re-runnable');
