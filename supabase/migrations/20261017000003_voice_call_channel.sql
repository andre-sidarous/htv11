-- Jam: allow automated phone calls to trusted contacts (Twilio) as a notification channel.
-- Contract change: src/lib/types/domain.ts NotificationChannel gains "voice_call".

alter table public.notification_events drop constraint if exists notification_events_channel_check;
alter table public.notification_events
  add constraint notification_events_channel_check
  check (channel in ('ntfy', 'sms_preview', 'in_app', 'voice_call'));

-- Lets the call function skip contacts it already called for an alert (idempotent retries).
create index if not exists notification_events_alert_channel_idx
  on public.notification_events (alert_id, channel)
  where alert_id is not null;
