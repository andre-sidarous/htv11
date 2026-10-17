-- Jam: initial schema
-- Tables, constraints, indexes. RLS lives in 20261017000002_rls.sql.
-- Mirrors src/lib/types/database.ts; change both together.

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 6 chars, no ambiguous characters (0/O, 1/I/L).
create or replace function public.generate_join_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (created in the profile-setup step, NOT by trigger)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  phone_number text check (phone_number is null or char_length(phone_number) <= 32),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- jams
-- ---------------------------------------------------------------------------

create table public.jams (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  join_code text not null unique default public.generate_join_code()
    check (join_code ~ '^[A-Z0-9]{6}$'),
  -- Random and unguessable: anyone who knows the topic can read ntfy messages.
  ntfy_topic text not null unique default ('jam-' || replace(gen_random_uuid()::text, '-', '')),
  destination_name text,
  destination_lat double precision check (destination_lat between -90 and 90),
  destination_lng double precision check (destination_lng between -180 and 180),
  expected_arrival timestamptz,
  travel_mode text not null default 'walking' check (travel_mode in ('walking', 'transit', 'mixed')),
  checkin_delay_seconds integer not null default 60 check (checkin_delay_seconds between 5 and 3600),
  group_response_timeout_seconds integer not null default 120 check (group_response_timeout_seconds between 5 and 3600),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'ended')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  check ((destination_lat is null) = (destination_lng is null)),
  check (status <> 'ended' or ended_at is not null)
);

create index jams_host_id_idx on public.jams (host_id);
create index jams_status_idx on public.jams (status);

-- ---------------------------------------------------------------------------
-- jam_members (consents all default false; emergency_preference must be chosen)
-- ---------------------------------------------------------------------------

create table public.jam_members (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null references public.jams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('host', 'member')),
  is_active boolean not null default true,
  location_consent boolean not null default false,
  health_consent boolean not null default false,
  ai_call_consent boolean not null default false,
  recording_consent boolean not null default false,
  contact_notify_consent boolean not null default false,
  emergency_preference text check (emergency_preference in ('ai_support_call', 'contact_only_alert')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (jam_id, user_id)
);

create index jam_members_user_id_idx on public.jam_members (user_id);

-- ---------------------------------------------------------------------------
-- live_locations (one latest row per member, upserted on (jam_id, user_id))
-- ---------------------------------------------------------------------------

create table public.live_locations (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision check (accuracy >= 0),
  activity text,
  sharing_enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (jam_id, user_id),
  foreign key (jam_id, user_id) references public.jam_members (jam_id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- health_signals (simulated only)
-- ---------------------------------------------------------------------------

create table public.health_signals (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  heart_rate double precision check (heart_rate between 0 and 300),
  baseline_heart_rate double precision check (baseline_heart_rate between 0 and 300),
  activity text check (activity in ('walking', 'running', 'stationary', 'fall_simulated')),
  movement_state text check (movement_state in ('normal', 'rapid', 'stopped')),
  source text not null default 'simulated' check (source = 'simulated'),
  created_at timestamptz not null default now(),
  foreign key (jam_id, user_id) references public.jam_members (jam_id, user_id) on delete cascade
);

create index health_signals_member_recent_idx on public.health_signals (jam_id, user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- alerts (escalation state machine lives here)
-- ---------------------------------------------------------------------------

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null references public.jams (id) on delete cascade,
  affected_user_id uuid not null references public.profiles (id) on delete cascade,
  risk_score numeric not null default 0 check (risk_score >= 0),
  severity text not null check (severity in ('low', 'moderate', 'high')),
  status text not null check (status in ('check_in', 'group_alert', 'ai_call', 'contacts_notified', 'resolved')),
  escalation_state text not null default 'MONITORING' check (escalation_state in (
    'MONITORING', 'CHECK_IN_SENT', 'USER_RESPONDED', 'GROUP_ALERT_SENT', 'GROUP_MEMBER_ACKNOWLEDGED',
    'AI_CALL_STARTING', 'AI_CALL_ACTIVE', 'AI_CALL_USER_RESPONDED', 'AI_CALL_USER_UNRESPONSIVE',
    'CONTACTS_NOTIFIED', 'RESOLVED', 'CANCELLED'
  )),
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  next_deadline_at timestamptz,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  -- An alert is "open" until resolved_at is set. RESOLVED/CANCELLED must set resolved_at.
  check (escalation_state not in ('RESOLVED', 'CANCELLED') or resolved_at is not null)
);

-- One open alert per member per Jam; duplicate triggers hit this and become no-ops.
create unique index alerts_one_open_per_member_idx
  on public.alerts (jam_id, affected_user_id)
  where resolved_at is null;

create index alerts_jam_id_idx on public.alerts (jam_id, created_at desc);
create index alerts_due_idx on public.alerts (next_deadline_at) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- alert_responses (New/Seen/Acknowledged/Responding/Resolved UI)
-- ---------------------------------------------------------------------------

create table public.alert_responses (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('seen', 'acknowledged', 'responding', 'safe')),
  created_at timestamptz not null default now(),
  unique (alert_id, user_id, kind)
);

create index alert_responses_alert_id_idx on public.alert_responses (alert_id);

-- ---------------------------------------------------------------------------
-- trusted_contacts (owner-only; phone numbers never visible to Jam members)
-- ---------------------------------------------------------------------------

create table public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  relationship text,
  phone_number text check (phone_number is null or char_length(phone_number) <= 32),
  email text,
  receive_location boolean not null default false,
  receive_health_summary boolean not null default false,
  receive_recording boolean not null default false,
  confirmation_status text not null default 'pending' check (confirmation_status in ('pending', 'confirmed', 'declined')),
  created_at timestamptz not null default now()
);

create index trusted_contacts_owner_idx on public.trusted_contacts (owner_user_id);

-- ---------------------------------------------------------------------------
-- incident_packages
-- recipients: jsonb array of {"type":"member","userId":uuid} | {"type":"contact","contactId":uuid}
-- access_token_hash: sha256 hex of the external-contact token; the raw token is never stored.
-- ---------------------------------------------------------------------------

create table public.incident_packages (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts (id) on delete cascade,
  affected_user_id uuid not null references public.profiles (id) on delete cascade,
  location_snapshot jsonb,
  health_summary jsonb,
  route_summary jsonb,
  recording_url text,
  recipients jsonb not null default '[]'::jsonb check (jsonb_typeof(recipients) = 'array'),
  access_token_hash text unique,
  retention_hours integer not null default 24 check (retention_hours between 1 and 720),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index incident_packages_alert_id_idx on public.incident_packages (alert_id);
create index incident_packages_recipients_idx on public.incident_packages using gin (recipients jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- notification_events ("last notification sent")
-- ---------------------------------------------------------------------------

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null references public.jams (id) on delete cascade,
  alert_id uuid references public.alerts (id) on delete set null,
  channel text not null check (channel in ('ntfy', 'sms_preview', 'in_app')),
  status text not null check (status in ('sent', 'skipped', 'failed')),
  detail text,
  created_at timestamptz not null default now()
);

create index notification_events_jam_recent_idx on public.notification_events (jam_id, created_at desc);
