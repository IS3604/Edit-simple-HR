-- =====================================================================
-- EditSimple HR — 0005 Scheduled jobs (pg_cron)
-- Supabase: Database → Extensions → enable "pg_cron" (or the line below does it).
-- Times are UTC. IST = UTC+5:30.
-- =====================================================================
create extension if not exists pg_cron with schema pg_catalog;

-- Remove old copies so this file can be re-run safely.
select cron.unschedule(jobname) from cron.job
 where jobname in ('es-hr-monthly-accrual', 'es-hr-year-end-cl-expiry');

-- Every day at 00:05 IST (18:35 UTC). Idempotent: credits only on the first run of
-- each month, and self-heals if a run was missed (e.g. on the 1st).
select cron.schedule('es-hr-monthly-accrual', '35 18 * * *', $$select public.run_monthly_accrual()$$);

-- 31 December 23:50 IST (18:20 UTC): expire remaining Casual Leave.
-- (The 1 January accrual also closes the year if this run was missed.)
select cron.schedule('es-hr-year-end-cl-expiry', '20 18 31 12 *', $$select public.run_year_end_expiry()$$);

-- Check:   select jobname, schedule, active from cron.job;
-- History: select * from cron.job_run_details order by start_time desc limit 20;
