-- =====================================================================
-- EditSimple HR — 0009 Edit or revoke special grants (Superadmin)
--   • Edit: change days and/or reason. The difference is posted to the ledger
--     as an 'adjustment' linked to the grant.
--   • Revoke: removes the granted days from the balance ('adjustment', negative)
--     and marks the grant revoked. History is kept.
--   Days already used can't be taken back: a reduction/revoke is refused if the
--   current balance is lower than the amount being removed.
-- =====================================================================

alter table public.special_grants
  add column if not exists revoked_at  timestamptz,
  add column if not exists revoked_by  uuid references public.profiles (id),
  add column if not exists updated_at  timestamptz,
  add column if not exists updated_by  uuid references public.profiles (id);

-- Whether the grant's days still sit in the live balance period.
create or replace function public._grant_period_open(g public.special_grants, b public.leave_balances)
returns boolean language sql immutable as $$
  select case g.leave_type
    when 'casual' then b.casual_year is not distinct from extract(year from g.granted_on)::int
    when 'earned' then true
    else b.wfh_month is not distinct from date_trunc('month', g.granted_on)::date
  end
$$;

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
  if p_days is null or p_days <= 0 or p_days > 31 or p_days * 2 <> trunc(p_days * 2) then
    raise exception 'Days must be between 0.5 and 31, in steps of 0.5' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Add a reason for the grant' using errcode = 'P0001'; end if;
  if length(p_reason) > 500 then raise exception 'Reason must be under 500 characters' using errcode = 'P0001'; end if;

  select * into g from public.special_grants where id = p_id for update;
  if not found then raise exception 'Grant not found' using errcode = 'P0001'; end if;
  if g.revoked_at is not null then raise exception 'This grant has been revoked' using errcode = 'P0001'; end if;

  v_diff := p_days - g.days;
  if v_diff <> 0 then
    select * into b from public.leave_balances where employee_id = g.employee_id for update;
    if not public._grant_period_open(g, b) then
      raise exception 'This grant has already expired (its % period has ended), so the days can''t be changed',
        case g.leave_type when 'wfh' then 'month' else 'year' end using errcode = 'P0001';
    end if;
    v_bal := case g.leave_type when 'casual' then b.casual when 'earned' then b.earned else b.wfh end;
    if v_diff < 0 and v_bal < -v_diff then
      raise exception 'Only % day(s) of this grant are still unused, so it can be reduced by at most that', trim_scale(v_bal)
        using errcode = 'P0001';
    end if;
    perform public._post_txn(g.employee_id, g.leave_type, 'adjustment', v_diff, null, null, g.id,
      format('Grant edited: %s → %s day(s)', trim_scale(g.days), trim_scale(p_days)), auth.uid());
  end if;

  update public.special_grants
     set days = p_days, reason = trim(p_reason), updated_at = now(), updated_by = auth.uid()
   where id = p_id;
end $$;

create or replace function public.revoke_special_grant(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  g     public.special_grants;
  b     public.leave_balances;
  v_bal numeric;
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
    if v_bal < g.days then
      raise exception 'The employee has already used part of this grant (only % day(s) left). Edit it down instead, or leave it.', trim_scale(v_bal)
        using errcode = 'P0001';
    end if;
    perform public._post_txn(g.employee_id, g.leave_type, 'adjustment', -g.days, null, null, g.id,
      format('Grant revoked: %s', g.reason), auth.uid());
  end if;
  -- If the period already ended, the days have expired anyway: just mark it revoked.

  update public.special_grants set revoked_at = now(), revoked_by = auth.uid() where id = p_id;
end $$;

revoke execute on function public._grant_period_open(public.special_grants, public.leave_balances) from public, anon, authenticated;
revoke execute on function public.update_special_grant(uuid, numeric, text) from public, anon;
revoke execute on function public.revoke_special_grant(uuid) from public, anon;
grant  execute on function public.update_special_grant(uuid, numeric, text) to authenticated;
grant  execute on function public.revoke_special_grant(uuid) to authenticated;

-- Employee-facing wording: extra-day requests go to "HR".
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
    raise exception 'Only % day(s) available. Raise a request to HR for extra days.', trim_scale(v_bal)
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

