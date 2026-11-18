-- =====================================================================
-- EditSimple HR — 0013 New leave type: Unpaid leave
-- Safe to run together with 0014 in one go (0014 only compares as text).
-- =====================================================================
alter type public.leave_type add value if not exists 'unpaid';
