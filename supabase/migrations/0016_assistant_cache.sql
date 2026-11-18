-- =====================================================================
-- EditSimple HR — 0016 Ask HR AI answer cache
-- A repeated question is answered from cache (no AI tokens) while the HR
-- data is unchanged. Any change to leave, balances, grants, employees,
-- holidays, users or settings produces a new data version, so stale answers
-- are never reused.
-- =====================================================================
create table if not exists public.assistant_cache (
  key         text primary key,               -- sha256(question + context + date + data version)
  answer      text not null check (length(answer) <= 40000),
  sources     jsonb not null default '[]',
  hits        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists assistant_cache_created_idx on public.assistant_cache (created_at);

alter table public.assistant_cache enable row level security;
drop policy if exists assistant_cache_superadmin on public.assistant_cache;
create policy assistant_cache_superadmin on public.assistant_cache for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());
revoke all on public.assistant_cache from anon;
grant select, insert, update, delete on public.assistant_cache to authenticated;

-- Fingerprint of all HR data the assistant can read. Changes whenever anything changes.
create or replace function public.hr_data_version()
returns text
language sql stable security definer set search_path = public as $$
  select md5(concat_ws('|',
    (select concat(count(*), max(updated_at)) from public.leave_requests),
    (select concat(count(*), max(id))         from public.leave_transactions),
    (select concat(count(*), max(updated_at)) from public.leave_balances),
    (select concat(count(*), max(created_at), max(updated_at), max(revoked_at)) from public.special_grants),
    (select concat(count(*), max(updated_at)) from public.employees),
    (select concat(count(*), max(updated_at)) from public.leave_allocations),
    (select concat(count(*), max(created_at), string_agg(holiday_date::text || name, ',' order by holiday_date)) from public.holidays),
    (select concat(count(*), max(updated_at)) from public.profiles),
    (select max(updated_at)::text from public.app_settings)
  ))
  where public.is_superadmin()
$$;
revoke execute on function public.hr_data_version() from public, anon;
grant  execute on function public.hr_data_version() to authenticated;
