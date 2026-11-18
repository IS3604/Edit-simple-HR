-- =====================================================================
-- EditSimple HR — 0015 Superadmin AI assistant: saved chats
-- Only Superadmins can use it, and each Superadmin sees only their own chats.
-- =====================================================================
create table if not exists public.assistant_chats (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null default 'New chat' check (length(title) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists assistant_chats_user_idx on public.assistant_chats (user_id, updated_at desc);

create table if not exists public.assistant_messages (
  id          bigint generated always as identity primary key,
  chat_id     uuid not null references public.assistant_chats (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (length(content) <= 40000),
  sources     jsonb not null default '[]',
  created_at  timestamptz not null default now()
);
create index if not exists assistant_messages_chat_idx on public.assistant_messages (chat_id, id);

alter table public.assistant_chats    enable row level security;
alter table public.assistant_messages enable row level security;

drop policy if exists assistant_chats_own on public.assistant_chats;
create policy assistant_chats_own on public.assistant_chats for all to authenticated
  using (public.is_superadmin() and user_id = auth.uid())
  with check (public.is_superadmin() and user_id = auth.uid());

drop policy if exists assistant_messages_own on public.assistant_messages;
create policy assistant_messages_own on public.assistant_messages for all to authenticated
  using (public.is_superadmin() and exists (select 1 from public.assistant_chats c where c.id = chat_id and c.user_id = auth.uid()))
  with check (public.is_superadmin() and exists (select 1 from public.assistant_chats c where c.id = chat_id and c.user_id = auth.uid()));

revoke all on public.assistant_chats, public.assistant_messages from anon;
grant select, insert, update, delete on public.assistant_chats, public.assistant_messages to authenticated;
