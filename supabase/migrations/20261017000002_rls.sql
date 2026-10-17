-- Jam: row level security, helper functions, RPCs, storage, realtime publication.
-- Server routes use the service-role key, which bypasses everything here.

-- ---------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER so policies can call them without
-- recursing into jam_members' own policies. search_path pinned for safety.
-- ---------------------------------------------------------------------------

create or replace function public.is_jam_member(p_jam_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jam_members m
    where m.jam_id = p_jam_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_active_jam_member(p_jam_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jam_members m
    where m.jam_id = p_jam_id and m.user_id = auth.uid()
      and m.is_active and m.left_at is null
  );
$$;

create or replace function public.is_jam_host(p_jam_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.jams j where j.id = p_jam_id and j.host_id = auth.uid());
$$;

create or replace function public.is_jam_running(p_jam_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.jams j where j.id = p_jam_id and j.status = 'active');
$$;

-- True if `p_user_id` is an active member of the Jam AND has given the named consent.
create or replace function public.member_has_consent(p_jam_id uuid, p_user_id uuid, p_consent text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jam_members m
    where m.jam_id = p_jam_id and m.user_id = p_user_id
      and m.is_active and m.left_at is null
      and case p_consent
        when 'location' then m.location_consent
        when 'health' then m.health_consent
        else false
      end
  );
$$;

create or replace function public.shares_jam_with(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jam_members me
    join public.jam_members them on them.jam_id = me.jam_id
    where me.user_id = auth.uid() and them.user_id = p_user_id
  );
$$;

create or replace function public.can_access_alert(p_alert_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.alerts a
    join public.jam_members m on m.jam_id = a.jam_id
    where a.id = p_alert_id and m.user_id = auth.uid()
  );
$$;

revoke all on function
  public.is_jam_member(uuid), public.is_active_jam_member(uuid), public.is_jam_host(uuid),
  public.is_jam_running(uuid), public.member_has_consent(uuid, uuid, text),
  public.shares_jam_with(uuid), public.can_access_alert(uuid)
from public, anon;
grant execute on function
  public.is_jam_member(uuid), public.is_active_jam_member(uuid), public.is_jam_host(uuid),
  public.is_jam_running(uuid), public.member_has_consent(uuid, uuid, text),
  public.shares_jam_with(uuid), public.can_access_alert(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. With RLS on and no matching policy, access is denied.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.jams enable row level security;
alter table public.jam_members enable row level security;
alter table public.live_locations enable row level security;
alter table public.health_signals enable row level security;
alter table public.alerts enable row level security;
alter table public.alert_responses enable row level security;
alter table public.trusted_contacts enable row level security;
alter table public.incident_packages enable row level security;
alter table public.notification_events enable row level security;

-- Anonymous visitors get nothing. External contacts use a server route instead.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- profiles: own row only. Co-members read basic fields via the member_profiles view.
-- ---------------------------------------------------------------------------

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: create own" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Basic info for people you share a Jam with. No phone numbers.
-- Runs as the view owner (bypasses profiles RLS) and filters explicitly.
create view public.member_profiles as
  select p.id, p.display_name, p.avatar_url
  from public.profiles p
  where p.id = auth.uid() or public.shares_jam_with(p.id);

revoke all on public.member_profiles from public, anon;
grant select on public.member_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- jams: members (and the host) read; host creates and updates. Joining is via join_jam().
-- ---------------------------------------------------------------------------

create policy "jams: members read" on public.jams
  for select to authenticated using (host_id = auth.uid() or public.is_jam_member(id));
create policy "jams: host creates" on public.jams
  for insert to authenticated with check (host_id = auth.uid());
create policy "jams: host updates" on public.jams
  for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

-- Clients can't rewrite identity columns.
revoke update on public.jams from authenticated;
grant update (name, destination_name, destination_lat, destination_lng, expected_arrival, travel_mode,
  checkin_delay_seconds, group_response_timeout_seconds, status, started_at, ended_at)
  on public.jams to authenticated;

-- ---------------------------------------------------------------------------
-- jam_members: co-members read; host inserts own host row; members update own consents.
-- ---------------------------------------------------------------------------

create policy "jam_members: co-members read" on public.jam_members
  -- `user_id = auth.uid()` lets insert(...).select() return your own new row.
  for select to authenticated using (user_id = auth.uid() or public.is_jam_member(jam_id));
create policy "jam_members: host adds self" on public.jam_members
  for insert to authenticated
  with check (user_id = auth.uid() and role = 'host' and public.is_jam_host(jam_id));
create policy "jam_members: update own" on public.jam_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Only consent / preference / presence columns are client-editable (no role or jam changes).
revoke update on public.jam_members from authenticated;
grant update (is_active, location_consent, health_consent, ai_call_consent, recording_consent,
  contact_notify_consent, emergency_preference, left_at)
  on public.jam_members to authenticated;

-- ---------------------------------------------------------------------------
-- live_locations: visible to active members of the Jam, only while the owner has
-- location consent and sharing enabled. Writes only for yourself, with consent, while running.
-- ---------------------------------------------------------------------------

create policy "live_locations: active members read consented" on public.live_locations
  for select to authenticated using (
    user_id = auth.uid()
    or (
      public.is_active_jam_member(jam_id)
      and sharing_enabled
      and public.member_has_consent(jam_id, user_id, 'location')
    )
  );
create policy "live_locations: write own" on public.live_locations
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.member_has_consent(jam_id, auth.uid(), 'location')
    and public.is_jam_running(jam_id)
  );
create policy "live_locations: update own" on public.live_locations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.member_has_consent(jam_id, auth.uid(), 'location'));
create policy "live_locations: delete own" on public.live_locations
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- health_signals: same shape as locations, gated on health consent.
-- ---------------------------------------------------------------------------

create policy "health_signals: active members read consented" on public.health_signals
  for select to authenticated using (
    user_id = auth.uid()
    or (public.is_active_jam_member(jam_id) and public.member_has_consent(jam_id, user_id, 'health'))
  );
create policy "health_signals: write own" on public.health_signals
  for insert to authenticated with check (
    user_id = auth.uid() and public.member_has_consent(jam_id, auth.uid(), 'health')
  );

-- ---------------------------------------------------------------------------
-- alerts: members read; active members create/update (POC: the risk engine runs on
-- the client). Time-driven escalation goes through POST /api/alerts/[id]/advance.
-- ---------------------------------------------------------------------------

create policy "alerts: members read" on public.alerts
  for select to authenticated using (public.is_jam_member(jam_id));
create policy "alerts: active members create" on public.alerts
  for insert to authenticated with check (public.is_active_jam_member(jam_id));
create policy "alerts: active members update" on public.alerts
  for update to authenticated
  using (public.is_active_jam_member(jam_id)) with check (public.is_active_jam_member(jam_id));

-- ---------------------------------------------------------------------------
-- alert_responses
-- ---------------------------------------------------------------------------

create policy "alert_responses: members read" on public.alert_responses
  for select to authenticated using (public.can_access_alert(alert_id));
create policy "alert_responses: respond as self" on public.alert_responses
  for insert to authenticated with check (user_id = auth.uid() and public.can_access_alert(alert_id));

-- ---------------------------------------------------------------------------
-- trusted_contacts: owner only. Phone numbers never leave the owner (enforced here).
-- ---------------------------------------------------------------------------

create policy "trusted_contacts: owner all" on public.trusted_contacts
  for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- incident_packages: the affected user and listed member recipients only.
-- External contacts: server route validates sha256(token) = access_token_hash and expiry.
-- ---------------------------------------------------------------------------

create policy "incident_packages: recipients read" on public.incident_packages
  for select to authenticated using (
    deleted_at is null
    and expires_at > now()
    and (
      affected_user_id = auth.uid()
      or recipients @> jsonb_build_array(jsonb_build_object('type', 'member', 'userId', auth.uid()::text))
    )
  );
create policy "incident_packages: members create" on public.incident_packages
  for insert to authenticated with check (public.can_access_alert(alert_id));
-- No client UPDATE policy: deletion goes through delete_incident_package() below.

-- Soft delete: wipes the sensitive payload, sets deleted_at, and returns the recording
-- path so the caller can remove it from Storage. Allowed for the affected user or a listed member.
create or replace function public.delete_incident_package(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recording text;
begin
  update public.incident_packages p
  set deleted_at = now(),
      location_snapshot = null,
      health_summary = null,
      route_summary = null,
      recording_url = null,
      access_token_hash = null
  from (select recording_url from public.incident_packages where id = p_id) old
  where p.id = p_id
    and p.deleted_at is null
    and (
      p.affected_user_id = auth.uid()
      or p.recipients @> jsonb_build_array(jsonb_build_object('type', 'member', 'userId', auth.uid()::text))
    )
  returning old.recording_url into v_recording;

  if not found then
    raise exception 'not_found_or_forbidden' using errcode = 'P0002';
  end if;
  return v_recording;
end;
$$;

revoke all on function public.delete_incident_package(uuid) from public, anon;
grant execute on function public.delete_incident_package(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- notification_events: members read; written by server routes (service role) only.
-- ---------------------------------------------------------------------------

create policy "notification_events: members read" on public.notification_events
  for select to authenticated using (public.is_jam_member(jam_id));

-- ---------------------------------------------------------------------------
-- RPC: join_jam(code). Non-members can't read jams, so joining goes through here.
-- Returns the jam id. Errors: not_authenticated, profile_required, invalid_code, jam_ended.
-- ---------------------------------------------------------------------------

create or replace function public.join_jam(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_jam public.jams%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;

  select * into v_jam from public.jams where join_code = upper(btrim(code));
  if not found then
    raise exception 'invalid_code' using errcode = 'P0002';
  end if;
  if v_jam.status = 'ended' then
    raise exception 'jam_ended' using errcode = 'P0001';
  end if;

  insert into public.jam_members (jam_id, user_id, role)
  values (v_jam.id, v_user, case when v_jam.host_id = v_user then 'host' else 'member' end)
  on conflict (jam_id, user_id) do update set is_active = true, left_at = null;

  return v_jam.id;
end;
$$;

revoke all on function public.join_jam(text) from public, anon;
grant execute on function public.join_jam(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private `recordings` bucket. Objects live under `{user_id}/...`.
-- Recipients get short-lived signed URLs from a server route, never direct access.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

create policy "recordings: owner uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recordings: owner reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recordings: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Realtime: allow postgres_changes (RLS-filtered) on tables the lobby / alert UI watches.
-- Live location + health go over Broadcast on jam:{jamId}, not postgres_changes.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.jams, public.jam_members, public.alerts, public.alert_responses;
