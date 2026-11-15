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
