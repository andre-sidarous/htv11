-- Each member's planned walking path to THEIR destination, saved by their own phone when they set a
-- destination (join, or change it). Everyone in the Huddle draws everyone's path; "off their planned
-- path" is measured against it. Additive only. Mirrors src/lib/types/database.ts (PlannedRoute).
--   { "to": {"latitude", "longitude", "name"}, "coordinates": [[lat, lng], ...], "distanceM", "durationS", "plannedAt" }
-- A plan, not a history: it never records where they actually walked.

alter table public.jam_members
  add column if not exists planned_route jsonb
  check (planned_route is null or (jsonb_typeof(planned_route) = 'object' and pg_column_size(planned_route) <= 20000));

-- Members already update their own row ("jam_members: update own"); allow this column too.
grant update (planned_route) on public.jam_members to authenticated;
