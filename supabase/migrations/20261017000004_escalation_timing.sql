-- Escalation timing and contact texts. Safe to re-run.
--
-- Flow: check-in -> (no answer within the person's buffer) group alert -> (no acknowledgment within
-- jams.group_response_timeout_seconds) AI support call, recorded if consented -> (45s of silence)
-- emergency contacts are called, then contacts and group receive the incident package.

-- How long Jam waits for a check-in answer before alerting the group. Set at sign-up.
alter table public.profiles
  add column if not exists checkin_buffer_seconds integer not null default 120;
alter table public.profiles drop constraint if exists profiles_checkin_buffer_seconds_check;
alter table public.profiles add constraint profiles_checkin_buffer_seconds_check
  check (checkin_buffer_seconds between 30 and 1800);

-- Contacts get a text with the last-seen location after the call.
alter table public.notification_events drop constraint if exists notification_events_channel_check;
alter table public.notification_events add constraint notification_events_channel_check
  check (channel in ('ntfy', 'sms_preview', 'in_app', 'voice_call', 'sms'));

-- One incident package per alert, so retries never create duplicates.
create unique index if not exists incident_packages_one_per_alert_idx
  on public.incident_packages (alert_id) where deleted_at is null;
