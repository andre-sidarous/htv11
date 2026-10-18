-- Check-in answers drive what the group sees, personal destinations, and "call my group".
-- Additive only: nothing existing changes. Mirrors src/lib/types/database.ts.

-- 1. What the person answered on the check-in ("I'm lost", "I need help", ...). Null = no answer.
alter table public.alerts
  add column if not exists checkin_response text
  check (checkin_response is null or checkin_response in ('im_okay', 'changed_destination', 'im_lost', 'need_help', 'cannot_respond'));

-- 2. "I changed my destination": a member's own destination, overriding the Jam's for them.
alter table public.jam_members
  add column if not exists destination_name text check (destination_name is null or char_length(destination_name) <= 120),
  add column if not exists destination_lat double precision check (destination_lat between -90 and 90),
  add column if not exists destination_lng double precision check (destination_lng between -180 and 180),
  add column if not exists destination_updated_at timestamptz;
alter table public.jam_members drop constraint if exists jam_members_personal_destination_pair;
alter table public.jam_members add constraint jam_members_personal_destination_pair
  check ((destination_lat is null) = (destination_lng is null));

-- Members already update their own row ("jam_members: update own"); allow these columns too.
grant update (destination_name, destination_lat, destination_lng, destination_updated_at)
  on public.jam_members to authenticated;

-- 3. "I need help → call someone in my group": phone numbers of the other active members, ONLY
-- for a caller who has an open alert in that Jam. Profiles stay private otherwise.
create or replace function public.member_phone_numbers(p_jam_id uuid)
returns table (user_id uuid, display_name text, phone_number text)
language sql stable security definer
set search_path = ''
as $$
  select m.user_id, p.display_name, p.phone_number
  from public.jam_members m
  join public.profiles p on p.id = m.user_id
  where m.jam_id = p_jam_id
    and m.is_active and m.left_at is null
    and m.user_id <> auth.uid()
    and p.phone_number is not null
    and exists (
      select 1 from public.alerts a
      where a.jam_id = p_jam_id and a.affected_user_id = auth.uid() and a.resolved_at is null
    );
$$;
revoke all on function public.member_phone_numbers(uuid) from public, anon;
grant execute on function public.member_phone_numbers(uuid) to authenticated;
