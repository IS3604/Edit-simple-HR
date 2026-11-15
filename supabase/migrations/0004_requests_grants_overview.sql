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
