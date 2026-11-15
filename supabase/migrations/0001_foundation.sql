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
