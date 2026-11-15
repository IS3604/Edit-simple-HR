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
