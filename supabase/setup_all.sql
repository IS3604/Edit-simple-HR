-- EditSimple HR — complete database setup (migrations 0001 → 0008 in one file).
-- Use on a NEW Supabase project. For an existing one, run only the migrations you haven't applied.


-- >>>>>>>>>> 0001_foundation.sql <<<<<<<<<<
-- =====================================================================
-- EditSimple HR — 0001 Foundation
-- Schema, helper functions, triggers and Row Level Security.
-- Business-logic RPCs (apply / approve / accrue) arrive in later phases.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------- Enums ----------------------------------------------------
create type public.app_role          as enum ('superadmin', 'admin', 'employee');
create type public.employee_category as enum ('permanent_wfh', 'office', 'hybrid');
create type public.employee_status   as enum ('active', 'inactive');
create type public.leave_type        as enum ('casual', 'earned', 'wfh');
create type public.request_status    as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.txn_kind          as enum ('monthly_credit', 'special_grant', 'debit', 'expiry', 'adjustment');

-- ---------- Settings (single row) -----------------------------------
create table public.app_settings (
  id            smallint primary key default 1 check (id = 1),
  weekend_days  smallint[] not null default '{0,6}',      -- 0 = Sunday … 6 = Saturday
  timezone      text       not null default 'Asia/Kolkata',
  el_cap        numeric(4,1) not null default 20 check (el_cap > 0),
  updated_at    timestamptz not null default now()
);
insert into public.app_settings (id) values (1);

-- ---------- Profiles (login + role) ---------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null default '',
  role        public.app_role not null default 'employee',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Employees (HR record) -----------------------------------
create table public.employees (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid unique references public.profiles (id) on delete restrict,
  employee_code  text not null unique check (length(trim(employee_code)) > 0),
  full_name      text not null check (length(trim(full_name)) > 0),
  email          text not null unique check (email = lower(email) and position('@' in email) > 1),
  department     text not null default '',
  designation    text not null default '',
  joining_date   date not null,
  category       public.employee_category not null,
  status         public.employee_status   not null default 'active',
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index employees_status_category_idx on public.employees (status, category);

-- ---------- Monthly allocation config (one row per employee) --------
create table public.leave_allocations (
  employee_id       uuid primary key references public.employees (id) on delete cascade,
  casual_per_month  numeric(4,1) not null default 0 check (casual_per_month between 0 and 31),
  earned_per_month  numeric(4,1) not null default 0 check (earned_per_month between 0 and 31),
  wfh_per_month     numeric(4,1) not null default 0 check (wfh_per_month    between 0 and 31),
  updated_by        uuid references public.profiles (id),
  updated_at        timestamptz not null default now()
);

-- ---------- Current balances (cache of the ledger) ------------------
create table public.leave_balances (
  employee_id  uuid primary key references public.employees (id) on delete cascade,
  casual       numeric(5,1) not null default 0 check (casual >= 0),
  earned       numeric(5,1) not null default 0 check (earned >= 0),
  wfh          numeric(5,1) not null default 0 check (wfh    >= 0),
  casual_year  int,          -- calendar year the CL balance belongs to
  wfh_month    date,         -- first day of the month the WFH balance belongs to
  updated_at   timestamptz not null default now()
);

-- ---------- Requests -------------------------------------------------
create table public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees (id) on delete cascade,
  leave_type     public.leave_type not null,
  start_date     date not null,
  end_date       date not null,
  days           numeric(4,1) not null check (days > 0),
  reason         text not null default '',
  status         public.request_status not null default 'pending',
  decided_by     uuid references public.profiles (id),
  decided_at     timestamptz,
  decision_note  text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_date >= start_date),
  -- WFH can't cross a month; CL can't cross a year (balances reset there)
  check (leave_type <> 'wfh'    or date_trunc('month', start_date) = date_trunc('month', end_date)),
  check (leave_type <> 'casual' or extract(year from start_date) = extract(year from end_date)),
  -- No overlapping live requests for the same employee
  constraint leave_requests_no_overlap exclude using gist (
    employee_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending', 'approved'))
);
create index leave_requests_emp_status_idx on public.leave_requests (employee_id, status);
create index leave_requests_status_dates_idx on public.leave_requests (status, start_date, end_date);

-- ---------- Special grants ------------------------------------------
create table public.special_grants (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id) on delete cascade,
  leave_type   public.leave_type not null,
  days         numeric(4,1) not null check (days > 0 and days <= 31),
  reason       text not null check (length(trim(reason)) > 0),
  granted_by   uuid not null references public.profiles (id),
  granted_on   date not null default current_date,
  created_at   timestamptz not null default now()
);
create index special_grants_emp_idx on public.special_grants (employee_id, created_at desc);

-- ---------- Ledger (source of truth) --------------------------------
create table public.leave_transactions (
  id             bigint generated always as identity primary key,
  employee_id    uuid not null references public.employees (id) on delete cascade,
  leave_type     public.leave_type not null,
  kind           public.txn_kind not null,
  amount         numeric(5,1) not null,          -- signed: + credit, − debit/expiry
  balance_after  numeric(5,1) not null check (balance_after >= 0),
  period         date,                            -- month (credits) or year start (CL expiry)
  request_id     uuid references public.leave_requests (id),
  grant_id       uuid references public.special_grants (id),
  note           text not null default '',
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  check (kind not in ('monthly_credit', 'expiry') or period is not null),
  check (kind <> 'debit'         or request_id is not null),
  check (kind <> 'special_grant' or grant_id   is not null)
);
create index leave_txn_emp_idx on public.leave_transactions (employee_id, created_at desc);
-- Idempotency: one monthly credit / one expiry per employee+type+period,
-- one debit per request, one ledger line per grant.
create unique index leave_txn_monthly_credit_uq on public.leave_transactions (employee_id, leave_type, period) where kind = 'monthly_credit';
create unique index leave_txn_expiry_uq         on public.leave_transactions (employee_id, leave_type, period) where kind = 'expiry';
create unique index leave_txn_debit_uq          on public.leave_transactions (request_id) where kind = 'debit';
create unique index leave_txn_grant_uq          on public.leave_transactions (grant_id)   where kind = 'special_grant';

-- ---------- Holidays -------------------------------------------------
create table public.holidays (
  id            uuid primary key default gen_random_uuid(),
  holiday_date  date not null unique,
  name          text not null check (length(trim(name)) > 0),
  created_at    timestamptz not null default now()
);

-- =====================================================================
-- Helper functions
-- =====================================================================
create or replace function public.app_current_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_current_role() = 'superadmin', false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_current_role() in ('superadmin', 'admin'), false)
$$;

create or replace function public.my_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select e.id from public.employees e
  join public.profiles p on p.id = e.profile_id
  where e.profile_id = auth.uid() and p.is_active
$$;

create or replace function public.today_local()
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone (select timezone from public.app_settings where id = 1))::date
$$;

-- Working days between two dates (inclusive), excluding weekend days and holidays.
create or replace function public.working_days(p_start date, p_end date)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
  from generate_series(p_start, p_end, interval '1 day') as g(d)
  where extract(dow from g.d)::smallint <> all ((select weekend_days from public.app_settings where id = 1)::smallint[])
    and not exists (select 1 from public.holidays h where h.holiday_date = g.d::date)
$$;

-- =====================================================================
-- Triggers
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch          before update on public.profiles          for each row execute function public.touch_updated_at();
create trigger employees_touch         before update on public.employees         for each row execute function public.touch_updated_at();
create trigger leave_allocations_touch before update on public.leave_allocations for each row execute function public.touch_updated_at();
create trigger leave_balances_touch    before update on public.leave_balances    for each row execute function public.touch_updated_at();
create trigger leave_requests_touch    before update on public.leave_requests    for each row execute function public.touch_updated_at();
create trigger app_settings_touch      before update on public.app_settings      for each row execute function public.touch_updated_at();

-- New auth user → profile. Role comes ONLY from app_metadata (server-controlled),
-- never from user_metadata (which a user can set themselves).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role public.app_role;
begin
  v_role := coalesce(nullif(new.raw_app_meta_data ->> 'role', '')::public.app_role, 'employee');
  insert into public.profiles (id, email, full_name, role)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''), v_role);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles: id/email are immutable from the API; always keep ≥1 active Superadmin.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id;
  new.email := old.email;
  if old.role = 'superadmin' and old.is_active
     and (new.role <> 'superadmin' or not new.is_active) then
    if not exists (select 1 from public.profiles
                   where role = 'superadmin' and is_active and id <> old.id) then
      raise exception 'At least one active Superadmin is required';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- New employee → empty allocation + balance rows.
create or replace function public.init_employee_rows()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.leave_allocations (employee_id) values (new.id) on conflict do nothing;
  insert into public.leave_balances    (employee_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger employees_init after insert on public.employees
  for each row execute function public.init_employee_rows();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.app_settings       enable row level security;
alter table public.profiles           enable row level security;
alter table public.employees          enable row level security;
alter table public.leave_allocations  enable row level security;
alter table public.leave_balances     enable row level security;
alter table public.leave_requests     enable row level security;
alter table public.special_grants     enable row level security;
alter table public.leave_transactions enable row level security;
alter table public.holidays           enable row level security;

-- Nothing is reachable without logging in.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant  execute on function public.app_current_role(), public.is_superadmin(), public.is_staff(),
                           public.my_employee_id(), public.today_local(), public.working_days(date, date)
  to authenticated;

-- app_settings
create policy settings_read   on public.app_settings for select to authenticated using (true);
create policy settings_update on public.app_settings for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- profiles: self or staff can read; only Superadmin can change roles/status.
create policy profiles_read   on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- employees
create policy employees_read   on public.employees for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());
create policy employees_insert on public.employees for insert to authenticated
  with check (public.is_superadmin());
create policy employees_update on public.employees for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- leave_allocations: read self/staff, write Superadmin only
create policy alloc_read   on public.leave_allocations for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_staff());
create policy alloc_update on public.leave_allocations for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Read-only from the API: balances, requests, grants, ledger.
-- All writes go through SECURITY DEFINER functions added in later phases.
create policy balances_read on public.leave_balances     for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_staff());
create policy requests_read on public.leave_requests     for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_staff());
create policy grants_read   on public.special_grants     for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_staff());
create policy txn_read      on public.leave_transactions for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_staff());

-- holidays: everyone reads, Superadmin manages
create policy holidays_read  on public.holidays for select to authenticated using (true);
create policy holidays_write on public.holidays for all    to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Column-level hardening: the API can never write ledger/balance/request/grant tables directly.
revoke insert, update, delete on public.leave_balances, public.leave_requests,
  public.special_grants, public.leave_transactions from authenticated;
revoke insert, delete on public.profiles, public.leave_allocations, public.app_settings from authenticated;
revoke delete on public.employees from authenticated;

-- >>>>>>>>>> 0002_employee_management.sql <<<<<<<<<<
-- =====================================================================
-- EditSimple HR — 0002 Employee management
-- Activate / deactivate an employee atomically:
--   employee.status + profile.is_active + auto-cancel pending requests.
-- (Blocking sign-in at the Auth level is done by the server with the Auth admin API.)
-- =====================================================================

create or replace function public.set_employee_status(p_employee_id uuid, p_status public.employee_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Superadmin can change employee status' using errcode = '42501';
  end if;

  select profile_id into v_profile from public.employees where id = p_employee_id for update;
  if not found then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  if v_profile = auth.uid() and p_status = 'inactive' then
    raise exception 'You cannot deactivate yourself' using errcode = '42501';
  end if;

  update public.employees set status = p_status where id = p_employee_id;

  if v_profile is not null then
    -- guard_profile_update still enforces "at least one active Superadmin"
    update public.profiles set is_active = (p_status = 'active') where id = v_profile;
  end if;

  if p_status = 'inactive' then
    update public.leave_requests
       set status = 'cancelled',
           decision_note = 'Auto-cancelled: employee deactivated'
     where employee_id = p_employee_id and status = 'pending';
  end if;
end $$;

revoke execute on function public.set_employee_status(uuid, public.employee_status) from public, anon;
grant  execute on function public.set_employee_status(uuid, public.employee_status) to authenticated;

-- Keep profile name in step with the HR record.
create or replace function public.sync_profile_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and new.full_name is distinct from old.full_name then
    update public.profiles set full_name = new.full_name where id = new.profile_id;
  end if;
  return new;
end $$;

create trigger employees_sync_name after update of full_name on public.employees
  for each row execute function public.sync_profile_name();

-- Fast name / email / code search
create index employees_name_idx on public.employees (lower(full_name));

-- >>>>>>>>>> 0003_balance_engine.sql <<<<<<<<<<
-- =====================================================================
-- EditSimple HR — 0003 Allocations & balance engine
-- All balance changes go through _post_txn, which writes the ledger line and
-- updates the cached balance in the same transaction. Every scheduled step is
-- guarded by an existence check taken under a row lock on leave_balances, and
-- backed by the unique indexes from 0001 — so re-running never double-credits.
-- =====================================================================

-- ---------- Core: post one ledger line + update the balance ----------
-- Caller must already hold the leave_balances row lock (SELECT … FOR UPDATE).
create or replace function public._post_txn(
  p_emp uuid, p_type public.leave_type, p_kind public.txn_kind, p_amount numeric,
  p_period date, p_request uuid, p_grant uuid, p_note text, p_actor uuid
) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_new numeric;
begin
  update public.leave_balances set
    casual = casual + case when p_type = 'casual' then p_amount else 0 end,
    earned = earned + case when p_type = 'earned' then p_amount else 0 end,
    wfh    = wfh    + case when p_type = 'wfh'    then p_amount else 0 end
  where employee_id = p_emp
  returning case p_type when 'casual' then casual when 'earned' then earned else wfh end
  into v_new;
  if not found then raise exception 'Balance row missing for employee %', p_emp; end if;

  insert into public.leave_transactions
    (employee_id, leave_type, kind, amount, balance_after, period, request_id, grant_id, note, created_by)
  values (p_emp, p_type, p_kind, p_amount, v_new, p_period, p_request, p_grant, coalesce(p_note, ''), p_actor);
  return v_new;
end $$;

create or replace function public._has_txn(p_emp uuid, p_type public.leave_type, p_kind public.txn_kind, p_period date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.leave_transactions
                 where employee_id = p_emp and leave_type = p_type and kind = p_kind and period = p_period)
$$;

-- ---------- CL year-end expiry (idempotent per employee + year) ------
create or replace function public.expire_casual(p_emp uuid, p_year int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  b public.leave_balances;
  v_period date := make_date(p_year, 1, 1);
begin
  select * into b from public.leave_balances where employee_id = p_emp for update;
  if not found then return false; end if;
  if public._has_txn(p_emp, 'casual', 'expiry', v_period) then return false; end if;
  if b.casual_year is not null and b.casual_year > p_year then return false; end if;

  -- Recorded even when 0, so the year is marked as closed.
  perform public._post_txn(p_emp, 'casual', 'expiry', -b.casual, v_period, null, null,
                           format('Unused CL for %s expired on 31 Dec', p_year), null);
  update public.leave_balances set casual_year = null where employee_id = p_emp;

  -- Policy #6: pending CL for the closed year can no longer be approved.
  update public.leave_requests
     set status = 'rejected', decided_at = now(), decision_note = 'Auto-rejected: CL year closed'
   where employee_id = p_emp and leave_type = 'casual' and status = 'pending'
     and extract(year from start_date) <= p_year;
  return true;
end $$;

-- ---------- Monthly credit for one employee (idempotent) -------------
create or replace function public.credit_monthly(p_emp uuid, p_month date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.leave_allocations;
  b public.leave_balances;
  v_month date := date_trunc('month', p_month)::date;
  v_year  int  := extract(year from p_month)::int;
  v_cap   numeric;
  v_amt   numeric;
begin
  select * into b from public.leave_balances where employee_id = p_emp for update;
  if not found then return; end if;
  select * into a from public.leave_allocations where employee_id = p_emp;
  select el_cap into v_cap from public.app_settings where id = 1;

  -- Close any earlier CL year first (covers a missed 31-Dec run).
  if b.casual_year is not null and b.casual_year < v_year then
    perform public.expire_casual(p_emp, b.casual_year);
  end if;

  -- Casual: accumulates within the calendar year.
  if not public._has_txn(p_emp, 'casual', 'monthly_credit', v_month) then
    select * into b from public.leave_balances where employee_id = p_emp;
    if b.casual_year is null or b.casual_year = v_year then
      perform public._post_txn(p_emp, 'casual', 'monthly_credit', a.casual_per_month, v_month, null, null,
                               'Monthly CL credit', null);
      update public.leave_balances set casual_year = v_year where employee_id = p_emp;
    end if;
  end if;

  -- Earned: accumulates, monthly credit stops at the cap (partial fill allowed).
  if not public._has_txn(p_emp, 'earned', 'monthly_credit', v_month) then
    select * into b from public.leave_balances where employee_id = p_emp;
    v_amt := least(a.earned_per_month, greatest(0, v_cap - b.earned));
    perform public._post_txn(p_emp, 'earned', 'monthly_credit', v_amt, v_month, null, null,
      case when v_amt < a.earned_per_month then format('Monthly EL credit (capped at %s)', v_cap)
           else 'Monthly EL credit' end, null);
  end if;

  -- WFH: no carry-forward. Expire last month's leftover, then set this month's allocation.
  if not public._has_txn(p_emp, 'wfh', 'monthly_credit', v_month) then
    select * into b from public.leave_balances where employee_id = p_emp;
    if b.wfh_month is null or b.wfh_month < v_month then
      if b.wfh > 0 then
        perform public._post_txn(p_emp, 'wfh', 'expiry', -b.wfh,
          coalesce(b.wfh_month, (v_month - interval '1 month')::date), null, null, 'Unused WFH expired at month end', null);
      end if;
      perform public._post_txn(p_emp, 'wfh', 'monthly_credit', a.wfh_per_month, v_month, null, null,
                               'Monthly WFH allocation', null);
      update public.leave_balances set wfh_month = v_month where employee_id = p_emp;
    end if;
  end if;
end $$;

-- ---------- Batch jobs (cron / service role only) ---------------------
create or replace function public.run_monthly_accrual(p_month date default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', coalesce(p_month, public.today_local()))::date;
  v_end   date := (v_month + interval '1 month - 1 day')::date;
  r record;
  n int := 0;
begin
  for r in select id from public.employees
           where status = 'active' and joining_date <= v_end
           order by id
  loop
    perform public.credit_monthly(r.id, v_month);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.run_year_end_expiry(p_year int default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_year int := coalesce(p_year, extract(year from public.today_local())::int);
  r record;
  n int := 0;
begin
  for r in select id from public.employees order by id loop
    if public.expire_casual(r.id, v_year) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ---------- Superadmin: set monthly allocation ------------------------
-- Returns 'credited' when this save also credited the current month (first setup / new joiner),
-- otherwise 'next_month' (change applies from the next monthly credit — policy #8/#9).
create or replace function public.set_allocation(p_emp uuid, p_casual numeric, p_earned numeric, p_wfh numeric)
returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.employees;
  v_month date := date_trunc('month', public.today_local())::date;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Superadmin can change allocations' using errcode = '42501';
  end if;
  if p_casual is null or p_earned is null or p_wfh is null
     or least(p_casual, p_earned, p_wfh) < 0 or greatest(p_casual, p_earned, p_wfh) > 31
     or p_casual * 2 <> trunc(p_casual * 2) or p_earned * 2 <> trunc(p_earned * 2) or p_wfh * 2 <> trunc(p_wfh * 2) then
    raise exception 'Allocations must be between 0 and 31, in steps of 0.5' using errcode = '22023';
  end if;

  select * into e from public.employees where id = p_emp;
  if not found then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  if e.category = 'permanent_wfh' then p_wfh := 0; end if;  -- policy #7

  update public.leave_allocations
     set casual_per_month = p_casual, earned_per_month = p_earned, wfh_per_month = p_wfh, updated_by = auth.uid()
   where employee_id = p_emp;

  if e.status = 'active'
     and e.joining_date <= (v_month + interval '1 month - 1 day')::date
     and not exists (select 1 from public.leave_transactions
                     where employee_id = p_emp and kind = 'monthly_credit' and period = v_month) then
    perform public.credit_monthly(p_emp, v_month);
    return 'credited';
  end if;
  return 'next_month';
end $$;

-- ---------- Read model: balances + pending + allocation ---------------
-- security_invoker → the caller's RLS applies (employees see only their own row).
create or replace view public.leave_overview with (security_invoker = true) as
select
  e.id as employee_id, e.full_name, e.employee_code, e.email, e.department, e.category, e.status,
  a.casual_per_month, a.earned_per_month, a.wfh_per_month,
  b.casual,
  b.earned,
  case when b.wfh_month = date_trunc('month', public.today_local())::date then b.wfh else 0 end as wfh,
  coalesce(p.casual, 0) as pending_casual,
  coalesce(p.earned, 0) as pending_earned,
  coalesce(p.wfh, 0)    as pending_wfh
from public.employees e
join public.leave_allocations a on a.employee_id = e.id
join public.leave_balances    b on b.employee_id = e.id
left join lateral (
  select sum(days) filter (where leave_type = 'casual') as casual,
         sum(days) filter (where leave_type = 'earned') as earned,
         sum(days) filter (where leave_type = 'wfh')    as wfh
  from public.leave_requests r
  where r.employee_id = e.id and r.status = 'pending'
) p on true;

-- ---------- Privileges ------------------------------------------------
revoke execute on function public._post_txn(uuid, public.leave_type, public.txn_kind, numeric, date, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public._has_txn(uuid, public.leave_type, public.txn_kind, date)        from public, anon, authenticated;
revoke execute on function public.expire_casual(uuid, int)                                          from public, anon, authenticated;
revoke execute on function public.credit_monthly(uuid, date)                                        from public, anon, authenticated;
revoke execute on function public.run_monthly_accrual(date)                                         from public, anon, authenticated;
revoke execute on function public.run_year_end_expiry(int)                                          from public, anon, authenticated;
revoke execute on function public.set_allocation(uuid, numeric, numeric, numeric)                   from public, anon;
grant  execute on function public.set_allocation(uuid, numeric, numeric, numeric)                   to authenticated;

-- Allocations change only through set_allocation (so first-time credits are never skipped).
revoke update on public.leave_allocations from authenticated;

revoke all on public.leave_overview from anon;
grant select on public.leave_overview to authenticated;

-- >>>>>>>>>> 0004_requests_grants_overview.sql <<<<<<<<<<
-- =====================================================================
-- EditSimple HR — 0004 Requests, approvals, special grants, HR overview
-- User-facing errors use SQLSTATE P0001 (message shown as-is in the UI).
-- =====================================================================

-- ---------- Allocation "configured" flag ------------------------------
-- Employees whose allocation was never saved are skipped by the monthly job,
-- so the first save can still credit the current month (policy #8).
alter table public.leave_allocations add column if not exists configured_at timestamptz;
update public.leave_allocations set configured_at = updated_at where updated_by is not null and configured_at is null;

create or replace function public.set_allocation(p_emp uuid, p_casual numeric, p_earned numeric, p_wfh numeric)
returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.employees;
  v_month date := date_trunc('month', public.today_local())::date;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Superadmin can change allocations' using errcode = '42501';
  end if;
  if p_casual is null or p_earned is null or p_wfh is null
     or least(p_casual, p_earned, p_wfh) < 0 or greatest(p_casual, p_earned, p_wfh) > 31
     or p_casual * 2 <> trunc(p_casual * 2) or p_earned * 2 <> trunc(p_earned * 2) or p_wfh * 2 <> trunc(p_wfh * 2) then
    raise exception 'Allocations must be between 0 and 31, in steps of 0.5' using errcode = '22023';
  end if;

  select * into e from public.employees where id = p_emp;
  if not found then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  if e.category = 'permanent_wfh' then p_wfh := 0; end if;

  update public.leave_allocations
     set casual_per_month = p_casual, earned_per_month = p_earned, wfh_per_month = p_wfh,
         updated_by = auth.uid(), configured_at = coalesce(configured_at, now())
   where employee_id = p_emp;

  if e.status = 'active'
     and e.joining_date <= (v_month + interval '1 month - 1 day')::date
     and not exists (select 1 from public.leave_transactions
                     where employee_id = p_emp and kind = 'monthly_credit' and period = v_month) then
    perform public.credit_monthly(p_emp, v_month);
    return 'credited';
  end if;
  return 'next_month';
end $$;

-- Monthly job: safe to run daily (idempotent). Also closes stale WFH requests.
create or replace function public.run_monthly_accrual(p_month date default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', coalesce(p_month, public.today_local()))::date;
  v_end   date := (v_month + interval '1 month - 1 day')::date;
  r record;
  n int := 0;
begin
  -- WFH requests from an ended month can no longer be approved.
  update public.leave_requests
     set status = 'rejected', decided_at = now(), decision_note = 'Auto-rejected: WFH month ended'
   where leave_type = 'wfh' and status = 'pending' and start_date < v_month;

  for r in select e.id from public.employees e
           join public.leave_allocations a on a.employee_id = e.id
           where e.status = 'active' and e.joining_date <= v_end and a.configured_at is not null
           order by e.id
  loop
    perform public.credit_monthly(r.id, v_month);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Pending WFH only counts for the current month.
create or replace view public.leave_overview with (security_invoker = true) as
select
  e.id as employee_id, e.full_name, e.employee_code, e.email, e.department, e.category, e.status,
  a.casual_per_month, a.earned_per_month, a.wfh_per_month,
  b.casual,
  b.earned,
  case when b.wfh_month = date_trunc('month', public.today_local())::date then b.wfh else 0 end as wfh,
  coalesce(p.casual, 0) as pending_casual,
  coalesce(p.earned, 0) as pending_earned,
  coalesce(p.wfh, 0)    as pending_wfh
from public.employees e
join public.leave_allocations a on a.employee_id = e.id
join public.leave_balances    b on b.employee_id = e.id
left join lateral (
  select sum(days) filter (where leave_type = 'casual') as casual,
         sum(days) filter (where leave_type = 'earned') as earned,
         sum(days) filter (where leave_type = 'wfh'
                             and start_date >= date_trunc('month', public.today_local())::date) as wfh
  from public.leave_requests r
  where r.employee_id = e.id and r.status = 'pending'
) p on true;

-- ---------- Employee: apply -------------------------------------------
create or replace function public.apply_leave(p_type public.leave_type, p_start date, p_end date, p_reason text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e        public.employees;
  b        public.leave_balances;
  v_today  date := public.today_local();
  v_month  date := date_trunc('month', public.today_local())::date;
  v_days   int;
  v_bal    numeric;
  v_pend   numeric;
  v_id     uuid;
begin
  select * into e from public.employees where id = public.my_employee_id();
  if not found then raise exception 'Your login is not linked to an employee record' using errcode = 'P0001'; end if;
  if e.status <> 'active' then raise exception 'Your account is inactive' using errcode = 'P0001'; end if;
  if p_start is null or p_end is null then raise exception 'Choose start and end dates' using errcode = 'P0001'; end if;
  if p_end < p_start then raise exception 'End date must be on or after the start date' using errcode = 'P0001'; end if;
  if p_end - p_start > 60 then raise exception 'One request can cover at most 60 days' using errcode = 'P0001'; end if;
  if length(coalesce(p_reason, '')) > 500 then raise exception 'Reason must be under 500 characters' using errcode = 'P0001'; end if;
  if p_start < e.joining_date then raise exception 'Dates can''t be before your joining date' using errcode = 'P0001'; end if;

  if p_type = 'wfh' then
    if e.category = 'permanent_wfh' then
      raise exception 'Permanent WFH employees don''t need WFH requests' using errcode = 'P0001';
    end if;
    if p_start < v_today then raise exception 'WFH can''t be requested for past dates' using errcode = 'P0001'; end if;
    if date_trunc('month', p_end)::date <> v_month then
      raise exception 'WFH can only be requested for the current month' using errcode = 'P0001';
    end if;
  else
    if p_start < v_today - 30 then raise exception 'Leave can be back-dated by at most 30 days' using errcode = 'P0001'; end if;
    if p_type = 'casual' and (extract(year from p_start) <> extract(year from v_today)
                              or extract(year from p_end) <> extract(year from v_today)) then
      raise exception 'Casual Leave can only be taken within the current calendar year' using errcode = 'P0001';
    end if;
  end if;

  v_days := public.working_days(p_start, p_end);
  if v_days = 0 then raise exception 'The selected dates have no working days' using errcode = 'P0001'; end if;

  -- Lock the balance row so two simultaneous applications can't both pass the check.
  select * into b from public.leave_balances where employee_id = e.id for update;
  v_bal := case p_type
             when 'casual' then b.casual
             when 'earned' then b.earned
             else case when b.wfh_month = v_month then b.wfh else 0 end
           end;
  select coalesce(sum(days), 0) into v_pend from public.leave_requests
   where employee_id = e.id and leave_type = p_type and status = 'pending'
     and (p_type <> 'wfh' or start_date >= v_month);

  if v_days > v_bal - v_pend then
    raise exception 'Not enough balance: % day(s) requested, % available', v_days, greatest(v_bal - v_pend, 0)
      using errcode = 'P0001';
  end if;

  begin
    insert into public.leave_requests (employee_id, leave_type, start_date, end_date, days, reason)
    values (e.id, p_type, p_start, p_end, v_days, coalesce(trim(p_reason), ''))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'These dates overlap another pending or approved request' using errcode = 'P0001';
  end;
  return v_id;
end $$;

-- ---------- Employee: cancel own pending ------------------------------
create or replace function public.cancel_request(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.leave_requests;
begin
  select * into r from public.leave_requests where id = p_id for update;
  if not found or r.employee_id is distinct from public.my_employee_id() then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if r.status <> 'pending' then
    raise exception 'Only pending requests can be cancelled' using errcode = 'P0001';
  end if;
  update public.leave_requests set status = 'cancelled' where id = p_id;
end $$;

-- ---------- Admin / Superadmin: approve or reject --------------------
create or replace function public.decide_request(p_id uuid, p_approve boolean, p_note text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  r       public.leave_requests;
  b       public.leave_balances;
  v_month date := date_trunc('month', public.today_local())::date;
  v_bal   numeric;
begin
  if not public.is_staff() then
    raise exception 'Only Admins can approve or reject requests' using errcode = '42501';
  end if;
  select * into r from public.leave_requests where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0001'; end if;
  if r.status <> 'pending' then raise exception 'This request is already %', r.status using errcode = 'P0001'; end if;
  if r.employee_id = public.my_employee_id() then
    raise exception 'You can''t approve or reject your own request' using errcode = 'P0001';
  end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'Note must be under 500 characters' using errcode = 'P0001'; end if;

  if not p_approve then
    update public.leave_requests
       set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(trim(p_note), '')
     where id = p_id;
    return;
  end if;

  select * into b from public.leave_balances where employee_id = r.employee_id for update;

  if r.leave_type = 'wfh' then
    if date_trunc('month', r.start_date)::date <> v_month or b.wfh_month is distinct from v_month then
      raise exception 'This month''s WFH balance isn''t available for these dates' using errcode = 'P0001';
    end if;
    v_bal := b.wfh;
  elsif r.leave_type = 'casual' then
    if b.casual_year is not null and b.casual_year <> extract(year from r.start_date)::int then
      raise exception 'The Casual Leave year for these dates is closed' using errcode = 'P0001';
    end if;
    v_bal := b.casual;
  else
    v_bal := b.earned;
  end if;

  if r.days > v_bal then
    raise exception 'Not enough balance to approve: % day(s) needed, % available', r.days, v_bal using errcode = 'P0001';
  end if;

  -- Unique index on (request_id) where kind='debit' makes a double deduction impossible.
  perform public._post_txn(r.employee_id, r.leave_type, 'debit', -r.days, null, r.id, null,
                           format('%s to %s', to_char(r.start_date, 'DD Mon'), to_char(r.end_date, 'DD Mon YYYY')),
                           auth.uid());
  update public.leave_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(trim(p_note), '')
   where id = p_id;
end $$;

-- ---------- Superadmin: special grant ---------------------------------
create or replace function public.grant_special(p_emp uuid, p_type public.leave_type, p_days numeric, p_reason text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e       public.employees;
  a       public.leave_allocations;
  v_today date := public.today_local();
  v_month date := date_trunc('month', public.today_local())::date;
  v_gid   uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Superadmin can grant special leave' using errcode = '42501';
  end if;
  if p_days is null or p_days <= 0 or p_days > 31 or p_days * 2 <> trunc(p_days * 2) then
    raise exception 'Days must be between 0.5 and 31, in steps of 0.5' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Add a reason for the grant' using errcode = 'P0001'; end if;
  if length(p_reason) > 500 then raise exception 'Reason must be under 500 characters' using errcode = 'P0001'; end if;

  select * into e from public.employees where id = p_emp;
  if not found then raise exception 'Employee not found' using errcode = 'P0001'; end if;
  if e.status <> 'active' then raise exception 'Employee is inactive' using errcode = 'P0001'; end if;
  if p_type = 'wfh' and e.category = 'permanent_wfh' then
    raise exception 'Permanent WFH employees don''t use WFH days' using errcode = 'P0001';
  end if;

  -- Bring balances to the current period first (idempotent) so the grant lands in the right month/year.
  select * into a from public.leave_allocations where employee_id = p_emp;
  if a.configured_at is not null and e.joining_date <= (v_month + interval '1 month - 1 day')::date then
    perform public.credit_monthly(p_emp, v_month);
  end if;
  perform 1 from public.leave_balances where employee_id = p_emp for update;

  insert into public.special_grants (employee_id, leave_type, days, reason, granted_by, granted_on)
  values (p_emp, p_type, p_days, trim(p_reason), auth.uid(), v_today)
  returning id into v_gid;

  perform public._post_txn(p_emp, p_type, 'special_grant', p_days, null, null, v_gid, trim(p_reason), auth.uid());

  if p_type = 'casual' then
    update public.leave_balances set casual_year = coalesce(casual_year, extract(year from v_today)::int) where employee_id = p_emp;
  elsif p_type = 'wfh' then
    update public.leave_balances set wfh_month = coalesce(wfh_month, v_month) where employee_id = p_emp;
  end if;
  return v_gid;
end $$;

-- ---------- HR overview (staff) ---------------------------------------
create or replace function public.hr_overview()
returns json
language plpgsql stable security definer set search_path = public as $$
declare v_today date := public.today_local();
begin
  if not public.is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return json_build_object(
    'total',          (select count(*) from employees where status = 'active'),
    'permanent_wfh',  (select count(*) from employees where status = 'active' and category = 'permanent_wfh'),
    'office',         (select count(*) from employees where status = 'active' and category = 'office'),
    'hybrid',         (select count(*) from employees where status = 'active' and category = 'hybrid'),
    'on_leave_today', (select count(distinct r.employee_id) from leave_requests r join employees e on e.id = r.employee_id
                        where e.status = 'active' and r.status = 'approved' and r.leave_type in ('casual', 'earned')
                          and v_today between r.start_date and r.end_date),
    'wfh_today',      (select count(distinct r.employee_id) from leave_requests r join employees e on e.id = r.employee_id
                        where e.status = 'active' and r.status = 'approved' and r.leave_type = 'wfh'
                          and v_today between r.start_date and r.end_date),
    'pending_leave',  (select count(*) from leave_requests where status = 'pending' and leave_type in ('casual', 'earned')),
    'pending_wfh',    (select count(*) from leave_requests where status = 'pending' and leave_type = 'wfh'),
    'today',          v_today
  );
end $$;

create index if not exists leave_requests_type_status_idx on public.leave_requests (leave_type, status, start_date);

-- ---------- Privileges ------------------------------------------------
revoke execute on function public.apply_leave(public.leave_type, date, date, text)            from public, anon;
revoke execute on function public.cancel_request(uuid)                                        from public, anon;
revoke execute on function public.decide_request(uuid, boolean, text)                         from public, anon;
revoke execute on function public.grant_special(uuid, public.leave_type, numeric, text)       from public, anon;
revoke execute on function public.hr_overview()                                               from public, anon;
revoke execute on function public.run_monthly_accrual(date)                                   from public, anon, authenticated;
revoke execute on function public.set_allocation(uuid, numeric, numeric, numeric)             from public, anon;
grant  execute on function public.apply_leave(public.leave_type, date, date, text)            to authenticated;
grant  execute on function public.cancel_request(uuid)                                        to authenticated;
grant  execute on function public.decide_request(uuid, boolean, text)                         to authenticated;
grant  execute on function public.grant_special(uuid, public.leave_type, numeric, text)       to authenticated;
grant  execute on function public.hr_overview()                                               to authenticated;
grant  execute on function public.set_allocation(uuid, numeric, numeric, numeric)             to authenticated;
revoke all on public.leave_overview from anon;
grant select on public.leave_overview to authenticated;

-- >>>>>>>>>> 0005_cron.sql <<<<<<<<<<
-- =====================================================================
-- EditSimple HR — 0005 Scheduled jobs (pg_cron)
-- Supabase: Database → Extensions → enable "pg_cron" (or the line below does it).
-- Times are UTC. IST = UTC+5:30.
-- =====================================================================
create extension if not exists pg_cron with schema pg_catalog;

-- Remove old copies so this file can be re-run safely.
select cron.unschedule(jobname) from cron.job
 where jobname in ('es-hr-monthly-accrual', 'es-hr-year-end-cl-expiry');

-- Every day at 00:05 IST (18:35 UTC). Idempotent: credits only on the first run of
-- each month, and self-heals if a run was missed (e.g. on the 1st).
select cron.schedule('es-hr-monthly-accrual', '35 18 * * *', $$select public.run_monthly_accrual()$$);

-- 31 December 23:50 IST (18:20 UTC): expire remaining Casual Leave.
-- (The 1 January accrual also closes the year if this run was missed.)
select cron.schedule('es-hr-year-end-cl-expiry', '20 18 31 12 *', $$select public.run_year_end_expiry()$$);

-- Check:   select jobname, schedule, active from cron.job;
-- History: select * from cron.job_run_details order by start_time desc limit 20;

-- >>>>>>>>>> 0006_auto_approve_halfday_cancel.sql <<<<<<<<<<
-- =====================================================================
-- EditSimple HR — 0006 Auto-approval, extra-day requests, half-days,
--                     cancelling approved leave with refund
--
-- New flow:
--   • Request within available balance  → approved instantly (auto) + deducted.
--   • Request beyond balance            → employee explicitly "raises a request";
--                                         it stays pending for a Superadmin.
--   • Superadmin approves an extra-day request → available balance is used first,
--     the remainder is recorded on the request as extra_days (beyond balance).
--   • Approved leave that hasn't started can be cancelled → deducted days refunded.
-- =====================================================================

alter table public.leave_requests
  add column if not exists half_day         boolean not null default false,
  add column if not exists half_day_session text check (half_day_session in ('first', 'second')),
  add column if not exists is_extra         boolean not null default false,
  add column if not exists extra_days       numeric(4,1) not null default 0 check (extra_days >= 0),
  add column if not exists auto_approved    boolean not null default false,
  add column if not exists cancelled_by     uuid references public.profiles (id),
  add column if not exists cancelled_at     timestamptz;

alter table public.leave_requests drop constraint if exists leave_requests_half_day_chk;
alter table public.leave_requests add constraint leave_requests_half_day_chk
  check (not half_day or (start_date = end_date and days = 0.5 and half_day_session is not null));

-- One refund line per request (makes cancellation refunds idempotent).
create unique index if not exists leave_txn_refund_uq
  on public.leave_transactions (request_id) where kind = 'adjustment' and request_id is not null;

-- ---------- Helper: balance usable for a request's dates ---------------
-- CL must belong to the request's year; WFH to the request's (current) month.
create or replace function public._usable_balance(b public.leave_balances, p_type public.leave_type, p_start date)
returns numeric language sql immutable as $$
  select case p_type
    when 'casual' then case when b.casual_year is null or b.casual_year = extract(year from p_start)::int then b.casual else 0 end
    when 'earned' then b.earned
    else case when b.wfh_month = date_trunc('month', p_start)::date then b.wfh else 0 end
  end
$$;

-- ---------- Apply (replaces the 0004 version) --------------------------
drop function if exists public.apply_leave(public.leave_type, date, date, text);

create or replace function public.apply_leave(
  p_type     public.leave_type,
  p_start    date,
  p_end      date,
  p_reason   text    default '',
  p_half_day boolean default false,
  p_session  text    default null,
  p_raise    boolean default false     -- true = "raise a request" for days beyond balance
) returns json
language plpgsql security definer set search_path = public as $$
declare
  e        public.employees;
  b        public.leave_balances;
  v_today  date := public.today_local();
  v_month  date := date_trunc('month', public.today_local())::date;
  v_days   numeric;
  v_bal    numeric;
  v_id     uuid;
  v_status public.request_status;
begin
  select * into e from public.employees where id = public.my_employee_id();
  if not found then raise exception 'Your login is not linked to an employee record' using errcode = 'P0001'; end if;
  if e.status <> 'active' then raise exception 'Your account is inactive' using errcode = 'P0001'; end if;
  if p_start is null then raise exception 'Choose a start date' using errcode = 'P0001'; end if;
  if p_half_day then p_end := p_start; end if;
  if p_end is null then p_end := p_start; end if;
  if p_end < p_start then raise exception 'End date must be on or after the start date' using errcode = 'P0001'; end if;
  if p_end - p_start > 60 then raise exception 'One request can cover at most 60 days' using errcode = 'P0001'; end if;
  if length(coalesce(p_reason, '')) > 500 then raise exception 'Reason must be under 500 characters' using errcode = 'P0001'; end if;
  if p_start < e.joining_date then raise exception 'Dates can''t be before your joining date' using errcode = 'P0001'; end if;
  if p_half_day and coalesce(p_session, '') not in ('first', 'second') then
    raise exception 'Choose first half or second half' using errcode = 'P0001';
  end if;
  if p_raise and length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Add a reason when requesting extra days' using errcode = 'P0001';
  end if;

  if p_type = 'wfh' then
    if e.category = 'permanent_wfh' then
      raise exception 'Permanent WFH employees don''t need WFH requests' using errcode = 'P0001';
    end if;
    if p_start < v_today then raise exception 'WFH can''t be requested for past dates' using errcode = 'P0001'; end if;
    if date_trunc('month', p_end)::date <> v_month then
      raise exception 'WFH can only be requested for the current month' using errcode = 'P0001';
    end if;
  else
    if p_start < v_today - 30 then raise exception 'Leave can be back-dated by at most 30 days' using errcode = 'P0001'; end if;
    if p_type = 'casual' and (extract(year from p_start) <> extract(year from v_today)
                              or extract(year from p_end) <> extract(year from v_today)) then
      raise exception 'Casual Leave can only be taken within the current calendar year' using errcode = 'P0001';
    end if;
  end if;

  v_days := public.working_days(p_start, p_end);
  if v_days = 0 then raise exception 'The selected dates have no working days' using errcode = 'P0001'; end if;
  if p_half_day then v_days := 0.5; end if;

  select * into b from public.leave_balances where employee_id = e.id for update;
  v_bal := public._usable_balance(b, p_type, p_start);

  if v_days > v_bal and not p_raise then
    raise exception 'Only % day(s) available. Raise a request to the Superadmin for extra days.', v_bal
      using errcode = 'P0001';
  end if;

  v_status := case when v_days <= v_bal then 'approved' else 'pending' end;

  begin
    insert into public.leave_requests
      (employee_id, leave_type, start_date, end_date, days, reason, status, half_day, half_day_session,
       is_extra, auto_approved, decided_at, decision_note)
    values
      (e.id, p_type, p_start, p_end, v_days, coalesce(trim(p_reason), ''), v_status, p_half_day,
       case when p_half_day then p_session end,
       v_status = 'pending', v_status = 'approved',
       case when v_status = 'approved' then now() end,
       case when v_status = 'approved' then 'Auto-approved (within balance)' else '' end)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'These dates overlap another pending or approved request' using errcode = 'P0001';
  end;

  if v_status = 'approved' then
    perform public._post_txn(e.id, p_type, 'debit', -v_days, null, v_id, null,
      case when p_half_day then format('%s (%s half)', to_char(p_start, 'DD Mon YYYY'), p_session)
           else format('%s to %s', to_char(p_start, 'DD Mon'), to_char(p_end, 'DD Mon YYYY')) end,
      auth.uid());
  end if;

  return json_build_object('id', v_id, 'status', v_status, 'days', v_days, 'available', v_bal);
end $$;

-- ---------- Superadmin decides extra-day requests ----------------------
create or replace function public.decide_request(p_id uuid, p_approve boolean, p_note text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  r      public.leave_requests;
  b      public.leave_balances;
  v_bal  numeric;
  v_use  numeric;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Superadmin can decide extra-day requests' using errcode = '42501';
  end if;
  select * into r from public.leave_requests where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0001'; end if;
  if r.status <> 'pending' then raise exception 'This request is already %', r.status using errcode = 'P0001'; end if;
  if r.employee_id = public.my_employee_id() then
    raise exception 'You can''t decide your own request' using errcode = 'P0001';
  end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'Note must be under 500 characters' using errcode = 'P0001'; end if;

  if not p_approve then
    update public.leave_requests
       set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(trim(p_note), '')
     where id = p_id;
    return;
  end if;

  select * into b from public.leave_balances where employee_id = r.employee_id for update;
  v_bal := public._usable_balance(b, r.leave_type, r.start_date);
  v_use := least(v_bal, r.days);

  -- Unique (request_id) where kind='debit' → can never deduct twice. Recorded even when 0.
  perform public._post_txn(r.employee_id, r.leave_type, 'debit', -v_use, null, r.id, null,
    format('%s to %s%s', to_char(r.start_date, 'DD Mon'), to_char(r.end_date, 'DD Mon YYYY'),
           case when r.days > v_use then format(' · %s extra day(s) approved', r.days - v_use) else '' end),
    auth.uid());

  update public.leave_requests
     set status = 'approved', extra_days = r.days - v_use,
         decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(trim(p_note), '')
   where id = p_id;
end $$;

-- ---------- Cancel: pending (no change) or approved-not-started (refund) --
drop function if exists public.cancel_request(uuid);

create or replace function public.cancel_request(p_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  r        public.leave_requests;
  b        public.leave_balances;
  v_today  date := public.today_local();
  v_refund numeric := 0;
  v_ok     boolean;
begin
  select * into r from public.leave_requests where id = p_id for update;
  if not found or (r.employee_id is distinct from public.my_employee_id() and not public.is_superadmin()) then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if r.status not in ('pending', 'approved') then
    raise exception 'This request is already %', r.status using errcode = 'P0001';
  end if;
  if r.status = 'approved' and r.start_date <= v_today then
    raise exception 'Leave that has already started can''t be cancelled' using errcode = 'P0001';
  end if;

  if r.status = 'approved' then
    select * into b from public.leave_balances where employee_id = r.employee_id for update;
    v_refund := r.days - r.extra_days;
    -- Refund only into the same period the days came from.
    v_ok := case r.leave_type
              when 'casual' then b.casual_year is null or b.casual_year = extract(year from r.start_date)::int
              when 'earned' then true
              else b.wfh_month = date_trunc('month', r.start_date)::date
            end;
    if v_refund > 0 and v_ok then
      perform public._post_txn(r.employee_id, r.leave_type, 'adjustment', v_refund, null, r.id, null,
        'Refund: approved leave cancelled', auth.uid());
    else
      v_refund := 0;
    end if;
  end if;

  update public.leave_requests
     set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
   where id = p_id;

  return json_build_object('refunded', v_refund, 'was', r.status);
end $$;

-- ---------- Team calendar (staff) -------------------------------------
-- Approved leave/WFH overlapping a date range, without reasons.
create or replace function public.team_calendar(p_from date, p_to date)
returns table (employee_id uuid, full_name text, leave_type public.leave_type, start_date date, end_date date, half_day boolean, half_day_session text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'Invalid range' using errcode = 'P0001'; end if;
  return query
    select r.employee_id, e.full_name, r.leave_type, r.start_date, r.end_date, r.half_day, r.half_day_session
      from public.leave_requests r join public.employees e on e.id = r.employee_id
     where r.status = 'approved' and e.status = 'active'
       and r.start_date <= p_to and r.end_date >= p_from
     order by e.full_name, r.start_date;
end $$;

-- ---------- Privileges ------------------------------------------------
revoke execute on function public._usable_balance(public.leave_balances, public.leave_type, date) from public, anon, authenticated;
revoke execute on function public.apply_leave(public.leave_type, date, date, text, boolean, text, boolean) from public, anon;
revoke execute on function public.decide_request(uuid, boolean, text) from public, anon;
revoke execute on function public.cancel_request(uuid) from public, anon;
revoke execute on function public.team_calendar(date, date) from public, anon;
grant  execute on function public.apply_leave(public.leave_type, date, date, text, boolean, text, boolean) to authenticated;
grant  execute on function public.decide_request(uuid, boolean, text) to authenticated;
grant  execute on function public.cancel_request(uuid) to authenticated;
grant  execute on function public.team_calendar(date, date) to authenticated;

-- >>>>>>>>>> 0007_scenario_fixes.sql <<<<<<<<<<
-- =====================================================================
-- EditSimple HR — 0007 Fixes found by the AI-employee scenario simulation
-- =====================================================================

-- 1) apply_leave: report overlaps before balance problems; tidy numbers in messages.
create or replace function public.apply_leave(
  p_type     public.leave_type,
  p_start    date,
  p_end      date,
  p_reason   text    default '',
  p_half_day boolean default false,
  p_session  text    default null,
  p_raise    boolean default false     -- true = "raise a request" for days beyond balance
) returns json
language plpgsql security definer set search_path = public as $$
declare
  e        public.employees;
  b        public.leave_balances;
  v_today  date := public.today_local();
  v_month  date := date_trunc('month', public.today_local())::date;
  v_days   numeric;
  v_bal    numeric;
  v_id     uuid;
  v_status public.request_status;
begin
  select * into e from public.employees where id = public.my_employee_id();
  if not found then raise exception 'Your login is not linked to an employee record' using errcode = 'P0001'; end if;
  if e.status <> 'active' then raise exception 'Your account is inactive' using errcode = 'P0001'; end if;
  if p_start is null then raise exception 'Choose a start date' using errcode = 'P0001'; end if;
  if p_half_day then p_end := p_start; end if;
  if p_end is null then p_end := p_start; end if;
  if p_end < p_start then raise exception 'End date must be on or after the start date' using errcode = 'P0001'; end if;
  if p_end - p_start > 60 then raise exception 'One request can cover at most 60 days' using errcode = 'P0001'; end if;
  if length(coalesce(p_reason, '')) > 500 then raise exception 'Reason must be under 500 characters' using errcode = 'P0001'; end if;
  if p_start < e.joining_date then raise exception 'Dates can''t be before your joining date' using errcode = 'P0001'; end if;
  if p_half_day and coalesce(p_session, '') not in ('first', 'second') then
    raise exception 'Choose first half or second half' using errcode = 'P0001';
  end if;
  if p_raise and length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Add a reason when requesting extra days' using errcode = 'P0001';
  end if;

  if p_type = 'wfh' then
    if e.category = 'permanent_wfh' then
      raise exception 'Permanent WFH employees don''t need WFH requests' using errcode = 'P0001';
    end if;
    if p_start < v_today then raise exception 'WFH can''t be requested for past dates' using errcode = 'P0001'; end if;
    if date_trunc('month', p_end)::date <> v_month then
      raise exception 'WFH can only be requested for the current month' using errcode = 'P0001';
    end if;
  else
    if p_start < v_today - 30 then raise exception 'Leave can be back-dated by at most 30 days' using errcode = 'P0001'; end if;
    if p_type = 'casual' and (extract(year from p_start) <> extract(year from v_today)
                              or extract(year from p_end) <> extract(year from v_today)) then
      raise exception 'Casual Leave can only be taken within the current calendar year' using errcode = 'P0001';
    end if;
  end if;

  v_days := public.working_days(p_start, p_end);
  if v_days = 0 then raise exception 'The selected dates have no working days' using errcode = 'P0001'; end if;
  if p_half_day then v_days := 0.5; end if;

  select * into b from public.leave_balances where employee_id = e.id for update;

  -- Check overlap first: it's the more useful message.
  if exists (select 1 from public.leave_requests
             where employee_id = e.id and status in ('pending', 'approved')
               and daterange(start_date, end_date, '[]') && daterange(p_start, p_end, '[]')) then
    raise exception 'These dates overlap another pending or approved request' using errcode = 'P0001';
  end if;

  v_bal := public._usable_balance(b, p_type, p_start);

  if v_days > v_bal and not p_raise then
    raise exception 'Only % day(s) available. Raise a request to the Superadmin for extra days.', trim_scale(v_bal)
      using errcode = 'P0001';
  end if;

  v_status := case when v_days <= v_bal then 'approved' else 'pending' end;

  begin
    insert into public.leave_requests
      (employee_id, leave_type, start_date, end_date, days, reason, status, half_day, half_day_session,
       is_extra, auto_approved, decided_at, decision_note)
    values
      (e.id, p_type, p_start, p_end, v_days, coalesce(trim(p_reason), ''), v_status, p_half_day,
       case when p_half_day then p_session end,
       v_status = 'pending', v_status = 'approved',
       case when v_status = 'approved' then now() end,
       case when v_status = 'approved' then 'Auto-approved (within balance)' else '' end)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'These dates overlap another pending or approved request' using errcode = 'P0001';
  end;

  if v_status = 'approved' then
    perform public._post_txn(e.id, p_type, 'debit', -v_days, null, v_id, null,
      case when p_half_day then format('%s (%s half)', to_char(p_start, 'DD Mon YYYY'), p_session)
           else format('%s to %s', to_char(p_start, 'DD Mon'), to_char(p_end, 'DD Mon YYYY')) end,
      auth.uid());
  end if;

  return json_build_object('id', v_id, 'status', v_status, 'days', v_days, 'available', v_bal);
end $$;


-- >>>>>>>>>> 0008_push_subscriptions.sql <<<<<<<<<<
-- =====================================================================
-- EditSimple HR — 0008 Web push subscriptions
-- One row per browser/device that turned on notifications.
-- =====================================================================
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
revoke insert, update, delete on public.push_subscriptions from authenticated;

create policy push_read_own on public.push_subscriptions for select to authenticated
  using (profile_id = auth.uid());

-- Save (or move to the current user) a browser subscription.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'Invalid subscription' using errcode = 'P0001';
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid();
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.delete_push_subscription(text) from public, anon;
grant  execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant  execute on function public.delete_push_subscription(text) to authenticated;
