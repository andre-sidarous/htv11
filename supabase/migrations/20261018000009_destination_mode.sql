-- One destination for the whole Huddle, or everyone picks their own.
-- 'group': jams.destination_* is everyone's destination (anyone can still say "I'm heading somewhere else").
-- 'individual': each member picks theirs when joining (jam_members.destination_*); jams.destination_*
-- is the host's own and the fallback for anyone who hasn't picked.
alter table public.jams
  add column if not exists destination_mode text not null default 'group'
  check (destination_mode in ('group', 'individual'));
