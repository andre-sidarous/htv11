-- Jam: Campus Walk demo seed. DEMO / DEV PROJECTS ONLY.
--
-- Creates four test accounts (dev login fallback) and the "Campus Walk" Jam.
-- Re-running is safe and doubles as a hard demo reset: it clears alerts, responses,
-- incident packages, notification events, health signals and locations for the Jam.
--
-- Accounts (password for all: jam-demo-1234 — a public demo credential, not a secret):
--   host@jam.demo      Priya   (Host,           presenter 1)
--   member@jam.demo    Daniel  (Group member,   presenter 2)
--   affected@jam.demo  Alex    (Affected user,  presenter 3)
--   contact@jam.demo   Sam     (Emergency contact, presenter 4; not a Jam member)
--
-- IDs match src/lib/demo/campus-walk.json.
-- The DELETEs below only touch the seeded Campus Walk Jam (...a1) and seeded Alex's contacts:
-- real accounts and real Jams are never affected. The dashboard's "destructive" warning is expected.
--
-- Run: Supabase dashboard -> SQL Editor -> paste this file, or `npx supabase db reset` locally.

-- ---------------------------------------------------------------------------
-- auth users + email identities
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('jam-demo-1234', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', u.display_name), now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'host@jam.demo', 'Priya'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'member@jam.demo', 'Daniel'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'affected@jam.demo', 'Alex'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'contact@jam.demo', 'Sam')
) as u (id, email, display_name)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.id in (
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004'
)
on conflict (provider_id, provider) do nothing;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

insert into public.profiles (id, display_name)
values
  ('00000000-0000-4000-8000-000000000001', 'Priya'),
  ('00000000-0000-4000-8000-000000000002', 'Daniel'),
  ('00000000-0000-4000-8000-000000000003', 'Alex'),
  ('00000000-0000-4000-8000-000000000004', 'Sam')
on conflict (id) do update set display_name = excluded.display_name;

-- ---------------------------------------------------------------------------
-- reset Campus Walk runtime data (cascades: alert_responses, incident_packages)
-- ---------------------------------------------------------------------------

delete from public.notification_events where jam_id = '00000000-0000-4000-8000-0000000000a1';
delete from public.alerts where jam_id = '00000000-0000-4000-8000-0000000000a1';
delete from public.health_signals where jam_id = '00000000-0000-4000-8000-0000000000a1';
delete from public.live_locations where jam_id = '00000000-0000-4000-8000-0000000000a1';

-- ---------------------------------------------------------------------------
-- the Jam (active, so locations can be written immediately)
-- ---------------------------------------------------------------------------

insert into public.jams (
  id, host_id, name, join_code, destination_name, destination_lat, destination_lng,
  expected_arrival, travel_mode, checkin_delay_seconds, group_response_timeout_seconds,
  status, started_at, ended_at
)
values (
  '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001',
  'Campus Walk', 'CAMPUS', 'St. George Station', 43.6683, -79.3997,
  now() + interval '20 minutes', 'walking', 12, 15,
  'active', now(), null
)
on conflict (id) do update set
  status = 'active', started_at = now(), ended_at = null,
  expected_arrival = now() + interval '20 minutes';

-- ---------------------------------------------------------------------------
-- members (consents explicitly ON for the demo accounts only)
-- ---------------------------------------------------------------------------

insert into public.jam_members (
  jam_id, user_id, role, is_active, location_consent, health_consent, ai_call_consent,
  recording_consent, contact_notify_consent, emergency_preference
)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'host',   true, true, true, true, false, true, 'ai_support_call'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000002', 'member', true, true, true, true, false, true, 'ai_support_call'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000003', 'member', true, true, true, true, true,  true, 'ai_support_call')
on conflict (jam_id, user_id) do update set
  is_active = true, left_at = null,
  location_consent = excluded.location_consent, health_consent = excluded.health_consent,
  ai_call_consent = excluded.ai_call_consent, recording_consent = excluded.recording_consent,
  contact_notify_consent = excluded.contact_notify_consent,
  emergency_preference = excluded.emergency_preference;

-- starting positions
insert into public.live_locations (jam_id, user_id, latitude, longitude, accuracy, activity, sharing_enabled)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 43.6622, -79.3980, 8, 'walking', true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000002', 43.6623, -79.3978, 8, 'walking', true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000003', 43.6620, -79.3981, 8, 'walking', true);

-- ---------------------------------------------------------------------------
-- Alex's trusted contact (Sam). No phone number stored for the demo.
-- ---------------------------------------------------------------------------

delete from public.trusted_contacts where owner_user_id = '00000000-0000-4000-8000-000000000003';
insert into public.trusted_contacts (
  owner_user_id, name, relationship, email,
  receive_location, receive_health_summary, receive_recording, confirmation_status
)
values (
  '00000000-0000-4000-8000-000000000003', 'Sam', 'Sibling', 'contact@jam.demo',
  true, true, false, 'confirmed'
);
