-- =====================================================================
-- EditSimple HR — 0011 Team calendar visible to everyone
--   Staff:      name + exact type (CL / EL / WFH) + half-day.
--   Employees:  name + "leave" or "wfh" + half-day only (no leave type, no reasons).
-- =====================================================================
drop function if exists public.team_calendar(date, date);

create function public.team_calendar(p_from date, p_to date)
returns table (employee_id uuid, full_name text, leave_type text, start_date date, end_date date, half_day boolean, half_day_session text)
language plpgsql stable security definer set search_path = public as $$
declare v_staff boolean := public.is_staff();
begin
  if auth.uid() is null or public.app_current_role() is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'Invalid range' using errcode = 'P0001'; end if;
  return query
    select case when v_staff then r.employee_id end,          -- employees don't get IDs (no profile links)
           e.full_name,
           case when v_staff then r.leave_type::text
                when r.leave_type = 'wfh' then 'wfh' else 'leave' end,
           r.start_date, r.end_date, r.half_day, r.half_day_session
      from public.leave_requests r join public.employees e on e.id = r.employee_id
     where r.status = 'approved' and e.status = 'active'
       and r.start_date <= p_to and r.end_date >= p_from
     order by e.full_name, r.start_date;
end $$;

revoke execute on function public.team_calendar(date, date) from public, anon;
grant  execute on function public.team_calendar(date, date) to authenticated;
