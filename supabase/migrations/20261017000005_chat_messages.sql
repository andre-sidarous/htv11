-- Jam: group chat for members of a Jam. Append-only (no edit/delete in this prototype).
-- Mirrors src/lib/types/database.ts (ChatMessageRow). Added to supabase_realtime so the app can
-- subscribe to new messages the same way it already does for jams/jam_members/alerts.

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null references public.jams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index chat_messages_jam_created_idx on public.chat_messages (jam_id, created_at);

alter table public.chat_messages enable row level security;

create policy "chat_messages: members read" on public.chat_messages
  for select to authenticated using (public.is_jam_member(jam_id));

create policy "chat_messages: active members send" on public.chat_messages
  for insert to authenticated with check (user_id = auth.uid() and public.is_active_jam_member(jam_id));

alter publication supabase_realtime add table public.chat_messages;
