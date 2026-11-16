-- =====================================================================
-- EditSimple HR — 0012 Live updates (Supabase Realtime)
-- Adds the HR tables to the `supabase_realtime` publication so open screens
-- refresh automatically. Row Level Security still applies to every event.
-- Safe to re-run; does nothing on databases without the publication.
-- =====================================================================
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found — skipping';
    return;
  end if;
  foreach t in array array['leave_requests', 'leave_transactions', 'leave_balances', 'special_grants',
                           'holidays', 'employees', 'leave_allocations'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
