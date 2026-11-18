-- EditSimple HR — update for 18 Nov 2026 (policy v2). Paste into Supabase → SQL Editor → Run.
-- Contains migrations 0013 + 0014. Safe to re-run.


-- >>>>>>>>>> 0013_unpaid_leave_type.sql <<<<<<<<<<
-- =====================================================================
-- EditSimple HR — 0013 New leave type: Unpaid leave
-- Safe to run together with 0014 in one go (0014 only compares as text).
-- =====================================================================
alter type public.leave_type add value if not exists 'unpaid';

-- >>>>>>>>>> 0014_policy_v2.sql <<<<<<<<<<
-- =====================================================================
-- EditSimple HR — 0014 Policy v2 (18 Nov 2026)
--
--   1. CL / EL can no longer go negative. Requests must fit the balance;
--      anything beyond it is applied as Unpaid leave (or HR grants days).
--      Existing negative CL / EL balances are cleared to 0 (ledger adjustment).
--   2. WFH keeps the negative logic: HR can approve extra WFH down to −10;
--      the shortfall comes off next month's allocation.
--   3. Unpaid leave: no balance, salary is deducted, always needs approval.
--   4. Only two employee categories: Office / Hybrid ('office') and Permanent WFH.
--      Existing 'hybrid' employees become 'office'.
--   5. Grants can add OR take away days (negative grant = deduction).
--   6. Revoking a grant takes back only the unused part. Days the employee has
--      already used (approved leave) stay used; the grant records how many
--      were taken back.
--
-- Run 0013 first (or both together — see supabase/updates/2026-11-18_policy_v2.sql).
-- =====================================================================

-- ---------- 4. Categories ----------------------------------------------
update public.employees set category = 'office' where category = 'hybrid';
alter table public.employees drop constraint if exists employees_two_categories_chk;
alter table public.employees add constraint employees_two_categories_chk check (category::text <> 'hybrid');

-- ---------- 1/2. Limits ------------------------------------------------
create or replace function public._neg_limit(p_type public.leave_type)
returns numeric language sql immutable as $$
  select case when p_type::text = 'wfh' then -10 else 0 end::numeric
$$;

create or replace function public._usable_balance(b public.leave_balances, p_type public.leave_type, p_start date)
returns numeric language sql immutable as $$
  select case p_type::text
    when 'casual' then case when b.casual_year is null or b.casual_year = extract(year from p_start)::int then b.casual else 0 end
    when 'earned' then b.earned
    when 'wfh'    then case when b.wfh_month = date_trunc('month', p_start)::date then b.wfh else 0 end
    else 0
  end
$$;

-- Clear existing negative CL / EL (one adjustment line each).
do $$
declare r record;
begin
  for r in select employee_id, casual, earned from public.leave_balances where casual < 0 or earned < 0 for update loop
    if r.casual < 0 then
      perform public._post_txn(r.employee_id, 'casual', 'adjustment', -r.casual, null, null, null,
        'Negative CL cleared (policy change: CL can''t go below 0)', null);
    end if;
    if r.earned < 0 then
      perform public._post_txn(r.employee_id, 'earned', 'adjustment', -r.earned, null, null, null,
        'Negative EL cleared (policy change: EL can''t go below 0)', null);
    end if;
  end loop;
end $$;

alter table public.leave_balances drop constraint if exists leave_balances_casual_check;
alter table public.leave_balances drop constraint if exists leave_balances_earned_check;
alter table public.leave_balances add constraint leave_balances_casual_check check (casual >= 0);
alter table public.leave_balances add constraint leave_balances_earned_check check (earned >= 0);
alter table public.leave_balances drop constraint if exists leave_balances_wfh_check;
alter table public.leave_balances add constraint leave_balances_wfh_check check (wfh >= -10);
-- History keeps old negative lines, so only new rows are checked.
alter table public.leave_transactions drop constraint if exists leave_transactions_balance_after_check;
alter table public.leave_transactions add constraint leave_transactions_balance_after_check
  check (balance_after >= case when leave_type::text = 'wfh' then -10 else 0 end) not valid;
-- Unpaid leave never touches the ledger.
alter table public.leave_transactions drop constraint if exists leave_transactions_no_unpaid_chk;
alter table public.leave_transactions add constraint leave_transactions_no_unpaid_chk check (leave_type::text <> 'unpaid');

-- ---------- 5/6. Grants: add or deduct; partial revoke -------------------
alter table public.special_grants drop constraint if exists special_grants_days_check;
alter table public.special_grants drop constraint if exists special_grants_days_chk;
alter table public.special_grants add constraint special_grants_days_chk check (days <> 0 and days between -31 and 31);
alter table public.special_grants drop constraint if exists special_grants_type_chk;
alter table public.special_grants add constraint special_grants_type_chk check (leave_type::text <> 'unpaid');
alter table public.special_grants add column if not exists revoked_days numeric(4,1);
-- Days of a revoked grant that were already booked on future leave. If that
-- leave is later cancelled, the refund is clawed back up to this amount.
alter table public.special_grants add column if not exists revoke_owed numeric(4,1) not null default 0 check (revoke_owed >= 0);

create or replace function public.grant_special(p_emp uuid, p_type public.leave_type, p_days numeric, p_reason text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e       public.employees;
  a       public.leave_allocations;
  b       public.leave_balances;
  v_today date := public.today_local();
  v_month date := date_trunc('month', public.today_local())::date;
  v_bal   numeric;
  v_gid   uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Superadmin can grant or deduct days' using errcode = '42501';
  end if;
  if p_type::text = 'unpaid' then raise exception 'Unpaid leave has no balance to grant' using errcode = 'P0001'; end if;
  if p_days is null or p_days = 0 or abs(p_days) > 31 or p_days * 2 <> trunc(p_days * 2) then
    raise exception 'Days must be between 0.5 and 31, in steps of 0.5' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Add a reason' using errcode = 'P0001'; end if;
  if length(p_reason) > 500 then raise exception 'Reason must be under 500 characters' using errcode = 'P0001'; end if;

  select * into e from public.employees where id = p_emp;
  if not found then raise exception 'Employee not found' using errcode = 'P0001'; end if;
  if e.status <> 'active' then raise exception 'Employee is inactive' using errcode = 'P0001'; end if;
  if p_type = 'wfh' and e.category = 'permanent_wfh' then
    raise exception 'Permanent WFH employees don''t use WFH days' using errcode = 'P0001';
  end if;

  -- Bring balances to the current period first (idempotent).
  select * into a from public.leave_allocations where employee_id = p_emp;
  if a.configured_at is not null and e.joining_date <= (v_month + interval '1 month - 1 day')::date then
    perform public.credit_monthly(p_emp, v_month);
  end if;
  select * into b from public.leave_balances where employee_id = p_emp for update;

  if p_days < 0 then
    v_bal := public._usable_balance(b, p_type, v_today);
    if v_bal + p_days < 0 then
      raise exception 'Can''t deduct % day(s): only % available', trim_scale(-p_days), trim_scale(greatest(v_bal, 0))
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.special_grants (employee_id, leave_type, days, reason, granted_by, granted_on)
  values (p_emp, p_type, p_days, trim(p_reason), auth.uid(), v_today)
  returning id into v_gid;

  perform public._post_txn(p_emp, p_type, 'special_grant', p_days, null, null, v_gid,
    case when p_days < 0 then 'Deducted: ' else '' end || trim(p_reason), auth.uid());

  if p_type = 'casual' then
    -- If this year's CL is already closed (31 Dec after the year-end run), leave the
    -- year open-ended so the next month's credit still rolls into the new year.
    update public.leave_balances
       set casual_year = coalesce(casual_year,
             case when public._has_txn(p_emp, 'casual', 'expiry', make_date(extract(year from v_today)::int, 1, 1)) then null
                  else extract(year from v_today)::int end)
     where employee_id = p_emp;
  elsif p_type = 'wfh' then
    update public.leave_balances set wfh_month = coalesce(wfh_month, v_month) where employee_id = p_emp;
  end if;
  return v_gid;
end $$;

create or replace function public.update_special_grant(p_id uuid, p_days numeric, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  g      public.special_grants;
  b      public.leave_balances;
  v_bal  numeric;
  v_diff numeric;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Superadmin can edit grants' using errcode = '42501';
  end if;
  if p_days is null or p_days = 0 or abs(p_days) > 31 or p_days * 2 <> trunc(p_days * 2) then
    raise exception 'Days must be between 0.5 and 31, in steps of 0.5' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Add a reason' using errcode = 'P0001'; end if;
  if length(p_reason) > 500 then raise exception 'Reason must be under 500 characters' using errcode = 'P0001'; end if;

  select * into g from public.special_grants where id = p_id for update;
  if not found then raise exception 'Grant not found' using errcode = 'P0001'; end if;
  if g.revoked_at is not null then raise exception 'This grant has been revoked' using errcode = 'P0001'; end if;
  if sign(p_days) <> sign(g.days) then
    raise exception 'A grant can''t be turned into a deduction (or back). Revoke it and create a new one.' using errcode = 'P0001';
  end if;

  v_diff := p_days - g.days;
  if v_diff <> 0 then
    select * into b from public.leave_balances where employee_id = g.employee_id for update;
    if not public._grant_period_open(g, b) then
      raise exception 'This grant''s % has ended, so the days can''t be changed',
        case g.leave_type when 'wfh' then 'month' else 'year' end using errcode = 'P0001';
    end if;
    v_bal := case g.leave_type when 'casual' then b.casual when 'earned' then b.earned else b.wfh end;
    if v_diff < 0 and v_bal + v_diff < 0 then
      raise exception 'Only % day(s) are unused, so it can change by at most that', trim_scale(greatest(v_bal, 0))
        using errcode = 'P0001';
    end if;
    perform public._post_txn(g.employee_id, g.leave_type, 'adjustment', v_diff, null, null, g.id,
      format('%s edited: %s → %s day(s)', case when g.days < 0 then 'Deduction' else 'Grant' end,
             trim_scale(g.days), trim_scale(p_days)), auth.uid());
  end if;

  update public.special_grants
     set days = p_days, reason = trim(p_reason), updated_at = now(), updated_by = auth.uid()
   where id = p_id;
end $$;

drop function if exists public.revoke_special_grant(uuid);
create function public.revoke_special_grant(p_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  g      public.special_grants;
  b      public.leave_balances;
  v_bal  numeric;
  v_back numeric := 0;   -- amount posted back to the ledger (signed)
begin
  if not public.is_superadmin() then
    raise exception 'Only a Superadmin can revoke grants' using errcode = '42501';
  end if;
  select * into g from public.special_grants where id = p_id for update;
  if not found then raise exception 'Grant not found' using errcode = 'P0001'; end if;
  if g.revoked_at is not null then raise exception 'This grant is already revoked' using errcode = 'P0001'; end if;

  select * into b from public.leave_balances where employee_id = g.employee_id for update;
  if public._grant_period_open(g, b) then
    v_bal := case g.leave_type when 'casual' then b.casual when 'earned' then b.earned else b.wfh end;
    if g.days > 0 then
      v_back := -least(g.days, greatest(v_bal, 0));      -- take back only what's unused
    else
      v_back := -g.days;                                 -- undo a deduction: give the days back
    end if;
    if v_back <> 0 then
      perform public._post_txn(g.employee_id, g.leave_type, 'adjustment', v_back, null, null, g.id,
        case when g.days < 0 then format('Deduction revoked: %s day(s) returned', trim_scale(v_back))
             when -v_back < g.days then format('Grant revoked: %s of %s day(s) taken back (%s already used)',
                                               trim_scale(-v_back), trim_scale(g.days), trim_scale(g.days + v_back))
             else format('Grant revoked: %s day(s) taken back', trim_scale(-v_back)) end,
        auth.uid());
    end if;
  end if;

  update public.special_grants
     set revoked_at = now(), revoked_by = auth.uid(), revoked_days = abs(v_back),
         revoke_owed = case when g.days > 0 and public._grant_period_open(g, b) then g.days - abs(v_back) else 0 end
   where id = p_id;

  return json_build_object('days', g.days, 'taken_back', abs(v_back),
                           'already_used', case when g.days > 0 then g.days - abs(v_back) else 0 end,
                           'expired', not public._grant_period_open(g, b));
end $$;

revoke execute on function public.revoke_special_grant(uuid) from public, anon;
grant  execute on function public.revoke_special_grant(uuid) to authenticated;

-- ---------- 1/3. Apply ---------------------------------------------------
create or replace function public.apply_leave(
  p_type     public.leave_type,
  p_start    date,
  p_end      date,
  p_reason   text    default '',
  p_half_day boolean default false,
  p_session  text    default null,
  p_raise    boolean default false     -- WFH only: request extra days beyond balance
) returns json
language plpgsql security definer set search_path = public as $$
declare
  e        public.employees;
  b        public.leave_balances;
  v_today  date := public.today_local();
  v_month  date := date_trunc('month', public.today_local())::date;
  v_unpaid boolean := p_type::text = 'unpaid';
  v_days   numeric;
  v_bal    numeric;
  v_id     uuid;
  v_status public.request_status;
  v_label  text := case p_type::text when 'casual' then 'Casual Leave' when 'earned' then 'Earned Leave'
                                     when 'wfh' then 'WFH' else 'Unpaid leave' end;
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
  if (p_raise or v_unpaid) and length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Add a reason for HR' using errcode = 'P0001';
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

  if exists (select 1 from public.leave_requests
             where employee_id = e.id and status in ('pending', 'approved')
               and daterange(start_date, end_date, '[]') && daterange(p_start, p_end, '[]')) then
    raise exception 'These dates overlap another pending or approved request' using errcode = 'P0001';
  end if;

  if v_unpaid then
    v_bal := 0;
    v_status := 'pending';
  else
    v_bal := public._usable_balance(b, p_type, p_start);
    if p_type = 'wfh' then
      if v_bal - v_days < public._neg_limit(p_type) then
        raise exception 'This would take your WFH below the limit of % days (you have %). Choose fewer days.',
          public._neg_limit(p_type), trim_scale(v_bal) using errcode = 'P0001';
      end if;
      if v_days > v_bal and not p_raise then
        raise exception 'Only % WFH day(s) available. Raise a request to HR for extra days.', trim_scale(greatest(v_bal, 0))
          using errcode = 'P0001';
      end if;
    elsif v_days > v_bal then
      raise exception 'Only % day(s) of % available. Apply the rest as Unpaid leave, or ask HR to grant days.',
        trim_scale(greatest(v_bal, 0)), v_label using errcode = 'P0001';
    end if;
    v_status := case when v_days <= v_bal then 'approved' else 'pending' end;
  end if;

  begin
    insert into public.leave_requests
      (employee_id, leave_type, start_date, end_date, days, reason, status, half_day, half_day_session,
       is_extra, auto_approved, decided_at, decision_note)
    values
      (e.id, p_type, p_start, p_end, v_days, coalesce(trim(p_reason), ''), v_status, p_half_day,
       case when p_half_day then p_session end,
       v_status = 'pending' and not v_unpaid, v_status = 'approved',
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

-- ---------- HR decision -------------------------------------------------
create or replace function public.decide_request(p_id uuid, p_approve boolean, p_note text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  r      public.leave_requests;
  b      public.leave_balances;
  v_bal  numeric;
  v_new  numeric;
  v_month date := date_trunc('month', public.today_local())::date;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Superadmin can decide these requests' using errcode = '42501';
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

  -- Unpaid: nothing to deduct from a balance.
  if r.leave_type::text = 'unpaid' then
    update public.leave_requests
       set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(trim(p_note), '')
     where id = p_id;
    return;
  end if;

  select * into b from public.leave_balances where employee_id = r.employee_id for update;
  if r.leave_type = 'wfh' and date_trunc('month', r.start_date)::date <> v_month then
    raise exception 'This WFH request is for a month that has ended' using errcode = 'P0001';
  end if;
  if r.leave_type = 'casual' and b.casual_year is not null and b.casual_year <> extract(year from r.start_date)::int then
    raise exception 'The Casual Leave year for these dates is closed' using errcode = 'P0001';
  end if;

  v_bal := case r.leave_type when 'casual' then b.casual when 'earned' then b.earned
                              else case when b.wfh_month = v_month then b.wfh else 0 end end;
  v_new := v_bal - r.days;
  if v_new < public._neg_limit(r.leave_type) then
    if r.leave_type = 'wfh' then
      raise exception 'Approving would take WFH to % (limit −10). Reject it, or grant days first.', trim_scale(v_new)
        using errcode = 'P0001';
    else
      raise exception 'Only % day(s) available — CL/EL can''t go negative. Grant days first, or reject and ask for Unpaid leave.',
        trim_scale(greatest(v_bal, 0)) using errcode = 'P0001';
    end if;
  end if;

  perform public._post_txn(r.employee_id, r.leave_type, 'debit', -r.days, null, r.id, null,
    format('%s to %s%s', to_char(r.start_date, 'DD Mon'), to_char(r.end_date, 'DD Mon YYYY'),
           case when v_new < 0 then format(' · approved by HR, WFH now %s', trim_scale(v_new)) else '' end),
    auth.uid());

  update public.leave_requests
     set status = 'approved',
         extra_days = least(r.days, r.days - greatest(v_bal, 0)),
         decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(trim(p_note), '')
   where id = p_id;
end $$;


-- ---------- Cancel: refund, then claw back days of revoked grants ----------
create or replace function public.cancel_request(p_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  r        public.leave_requests;
  b        public.leave_balances;
  g        public.special_grants;
  v_today  date := public.today_local();
  v_refund numeric := 0;
  v_left   numeric;
  v_take   numeric;
  v_claw   numeric := 0;
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

  if r.status = 'approved' and r.leave_type::text <> 'unpaid' then
    select * into b from public.leave_balances where employee_id = r.employee_id for update;
    select coalesce(-sum(amount), 0) into v_refund from public.leave_transactions
     where request_id = r.id and kind = 'debit';
    v_ok := case r.leave_type::text
              when 'casual' then b.casual_year is null or b.casual_year = extract(year from r.start_date)::int
              when 'earned' then true
              else b.wfh_month = date_trunc('month', r.start_date)::date
            end;
    if v_refund > 0 and v_ok then
      perform public._post_txn(r.employee_id, r.leave_type, 'adjustment', v_refund, null, r.id, null,
        'Refund: approved leave cancelled', auth.uid());
      -- Revoked grants whose days were booked on leave: take them back from the refund.
      v_left := v_refund;
      for g in select * from public.special_grants
                where employee_id = r.employee_id and leave_type = r.leave_type and revoke_owed > 0
                order by revoked_at for update loop
        exit when v_left <= 0;
        select * into b from public.leave_balances where employee_id = r.employee_id;
        if not public._grant_period_open(g, b) then continue; end if;
        v_take := least(g.revoke_owed, v_left);
        perform public._post_txn(r.employee_id, r.leave_type, 'adjustment', -v_take, null, null, g.id,
          format('Revoked grant: %s day(s) taken back from the refund', trim_scale(v_take)), auth.uid());
        update public.special_grants
           set revoke_owed = revoke_owed - v_take, revoked_days = coalesce(revoked_days, 0) + v_take
         where id = g.id;
        v_left := v_left - v_take;
        v_claw := v_claw + v_take;
      end loop;
    else
      v_refund := 0;
    end if;
  end if;

  update public.leave_requests
     set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
   where id = p_id;

  return json_build_object('refunded', v_refund - v_claw, 'clawed_back', v_claw, 'was', r.status);
end $$;

-- ---------- Overviews ----------------------------------------------------
create or replace view public.leave_overview with (security_invoker = true) as
select
  e.id as employee_id, e.full_name, e.employee_code, e.email, e.department, e.category, e.status,
  a.casual_per_month, a.earned_per_month, a.wfh_per_month,
  b.casual,
  b.earned,
  case when b.wfh_month = date_trunc('month', public.today_local())::date then b.wfh else 0 end as wfh,
  coalesce(p.casual, 0) as pending_casual,
  coalesce(p.earned, 0) as pending_earned,
  coalesce(p.wfh, 0)    as pending_wfh,
  coalesce(p.unpaid, 0) as pending_unpaid,
  coalesce(u.month, 0)  as unpaid_month,
  coalesce(u.year, 0)   as unpaid_year
from public.employees e
join public.leave_allocations a on a.employee_id = e.id
join public.leave_balances    b on b.employee_id = e.id
left join lateral (
  select sum(days) filter (where leave_type = 'casual') as casual,
         sum(days) filter (where leave_type = 'earned') as earned,
         sum(days) filter (where leave_type = 'wfh'
                             and start_date >= date_trunc('month', public.today_local())::date) as wfh,
         sum(days) filter (where leave_type::text = 'unpaid') as unpaid
  from public.leave_requests r
  where r.employee_id = e.id and r.status = 'pending'
) p on true
left join lateral (
  select sum(days) filter (where date_trunc('month', start_date) = date_trunc('month', public.today_local())) as month,
         sum(days) filter (where extract(year from start_date) = extract(year from public.today_local())) as year
  from public.leave_requests r
  where r.employee_id = e.id and r.status = 'approved' and r.leave_type::text = 'unpaid'
) u on true;

create or replace function public.hr_overview()
returns json
language plpgsql stable security definer set search_path = public as $$
declare v_today date := public.today_local();
begin
  if not public.is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return json_build_object(
    'total',          (select count(*) from employees where status = 'active'),
    'permanent_wfh',  (select count(*) from employees where status = 'active' and category = 'permanent_wfh'),
    'office',         (select count(*) from employees where status = 'active' and category <> 'permanent_wfh'),
    'hybrid',         0,
    'on_leave_today', (select count(distinct r.employee_id) from leave_requests r join employees e on e.id = r.employee_id
                        where e.status = 'active' and r.status = 'approved' and r.leave_type::text <> 'wfh'
                          and v_today between r.start_date and r.end_date),
    'wfh_today',      (select count(distinct r.employee_id) from leave_requests r join employees e on e.id = r.employee_id
                        where e.status = 'active' and r.status = 'approved' and r.leave_type = 'wfh'
                          and v_today between r.start_date and r.end_date),
    'pending_leave',  (select count(*) from leave_requests where status = 'pending' and leave_type::text <> 'wfh'),
    'pending_wfh',    (select count(*) from leave_requests where status = 'pending' and leave_type = 'wfh'),
    'pending_unpaid', (select count(*) from leave_requests where status = 'pending' and leave_type::text = 'unpaid'),
    'unpaid_month',   (select coalesce(sum(days), 0) from leave_requests
                        where status = 'approved' and leave_type::text = 'unpaid'
                          and date_trunc('month', start_date) = date_trunc('month', v_today)),
    'today',          v_today
  );
end $$;
