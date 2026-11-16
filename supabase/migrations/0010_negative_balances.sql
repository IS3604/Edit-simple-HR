-- =====================================================================
-- EditSimple HR — 0010 Negative balances (owner policy, 16 Nov 2026)
--
--   • When HR approves days beyond the balance, the FULL request is deducted
--     and the balance goes negative (the shortfall is "owed").
--   • CL / EL: future monthly credits repay the shortfall.
--   • WFH: at the monthly reset the shortfall is taken off the new allocation
--     (e.g. −2 WFH, allocation 4 → next month starts at 2).
--   • CL year end: positive CL expires on 31 Dec; a negative CL carries into
--     the new year (−2 on 31 Dec + 1 on 1 Jan → −1).
--   • Floors: CL and EL can't go below −10, WFH can't go below −4.
--   • A request can only be auto-approved when it fits the positive balance;
--     anything else (including any request while negative) goes to HR.
-- =====================================================================

create or replace function public._neg_limit(p_type public.leave_type)
returns numeric language sql immutable as $$
  select case p_type when 'wfh' then -4 else -10 end::numeric
$$;

-- Allow negatives down to the floor.
alter table public.leave_balances drop constraint if exists leave_balances_casual_check;
alter table public.leave_balances drop constraint if exists leave_balances_earned_check;
alter table public.leave_balances drop constraint if exists leave_balances_wfh_check;
alter table public.leave_balances add constraint leave_balances_casual_check check (casual >= -10);
alter table public.leave_balances add constraint leave_balances_earned_check check (earned >= -10);
alter table public.leave_balances add constraint leave_balances_wfh_check    check (wfh    >= -4);
alter table public.leave_transactions drop constraint if exists leave_transactions_balance_after_check;
alter table public.leave_transactions add constraint leave_transactions_balance_after_check check (balance_after >= -10);

-- ---------- Year end: only POSITIVE CL expires; a shortfall carries over ----------
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

  perform public._post_txn(p_emp, 'casual', 'expiry', -greatest(b.casual, 0), v_period, null, null,
    case when b.casual < 0 then format('CL %s closed — shortfall of %s day(s) carried into %s', p_year, trim_scale(-b.casual), p_year + 1)
         else format('Unused CL for %s expired on 31 Dec', p_year) end, null);
  update public.leave_balances set casual_year = null where employee_id = p_emp;

  update public.leave_requests
     set status = 'rejected', decided_at = now(), decision_note = 'Auto-rejected: CL year closed'
   where employee_id = p_emp and leave_type = 'casual' and status = 'pending'
     and extract(year from start_date) <= p_year;
  return true;
end $$;

-- ---------- HR approval: deduct everything; balance may go negative ----------
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
    raise exception 'Approving would take the balance to % (limit %). Reject it, or grant days first.',
      trim_scale(v_new), public._neg_limit(r.leave_type) using errcode = 'P0001';
  end if;

  perform public._post_txn(r.employee_id, r.leave_type, 'debit', -r.days, null, r.id, null,
    format('%s to %s%s', to_char(r.start_date, 'DD Mon'), to_char(r.end_date, 'DD Mon YYYY'),
           case when v_new < 0 then format(' · approved by HR, balance now %s', trim_scale(v_new)) else '' end),
    auth.uid());

  update public.leave_requests
     set status = 'approved',
         extra_days = least(r.days, r.days - greatest(v_bal, 0)),   -- days beyond the positive balance (informational)
         decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(trim(p_note), '')
   where id = p_id;
end $$;

-- ---------- Cancel: refund exactly what was deducted ----------
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
    select coalesce(-sum(amount), 0) into v_refund from public.leave_transactions
     where request_id = r.id and kind = 'debit';
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

-- ---------- Apply: same rules + the negative floor ----------
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

  if v_bal - v_days < public._neg_limit(p_type) then
    raise exception 'This would take your % balance below the limit of % days (you have %). Choose fewer days.',
      case p_type when 'casual' then 'Casual Leave' when 'earned' then 'Earned Leave' else 'WFH' end,
      public._neg_limit(p_type), trim_scale(v_bal) using errcode = 'P0001';
  end if;

  if v_days > v_bal and not p_raise then
    raise exception 'Only % day(s) available. Raise a request to HR for extra days.', trim_scale(greatest(v_bal, 0))
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



revoke execute on function public._neg_limit(public.leave_type) from public, anon;
grant  execute on function public._neg_limit(public.leave_type) to authenticated;
