-- =====================================================================
-- EditSimple HR — 0017 Ask HR AI: how changes are applied
--   manual : every change shows a confirmation card (default)
--   smart  : low-risk changes run automatically; risky ones still ask
--   auto   : every change runs automatically
-- =====================================================================
alter table public.app_settings add column if not exists ai_mode text not null default 'manual';
alter table public.app_settings drop constraint if exists app_settings_ai_mode_chk;
alter table public.app_settings add constraint app_settings_ai_mode_chk check (ai_mode in ('manual', 'smart', 'auto'));
