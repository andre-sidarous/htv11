-- Jam: per-profile check-in buffer (how long an unanswered check-in waits before Jam
-- alerts the group). Chosen in profile setup, editable later in Settings.
-- Mirrors src/lib/types/database.ts (ProfileRow) and src/lib/constants (CHECKIN_BUFFER_CHOICES_S).

alter table public.profiles
  add column checkin_buffer_seconds integer not null default 120
    check (checkin_buffer_seconds in (60, 120, 300, 600));
