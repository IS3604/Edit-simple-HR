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
