// POST /functions/v1/demo-reset  { jamId } -> { ok, cleared }
//
// Makes the demo repeatable: clears alerts (and with them responses + incident packages),
// notification events, health signals, and live locations for ONE Jam. Host only.
// Never touches accounts, profiles, members, or trusted contacts. Recordings for that Jam's
// incident packages are removed from Storage too. The app then broadcasts demo_reset.
import { adminClient, isUuid, json, requireUser, serve } from "../_shared/supabase.ts";

serve(async (req, body) => {
  const jamId = body.jamId;
  if (!isUuid(jamId)) return json({ ok: false, error: "invalid_jam_id" }, 400);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  // Host check through RLS (non-members get no row).
  const { data: jam } = await auth.supabase.from("jams").select("id, host_id").eq("id", jamId).maybeSingle();
  if (!jam) return json({ ok: false, error: "not_found" }, 404);
  if (jam.host_id !== auth.user.id) return json({ ok: false, error: "host_only" }, 403);

  const admin = adminClient();
  const { data: alerts } = await admin.from("alerts").select("id").eq("jam_id", jamId);
  const alertIds = (alerts ?? []).map((a) => a.id as string);

  // Recordings first, while the package rows still point at them.
  if (alertIds.length) {
    const { data: pkgs } = await admin.from("incident_packages").select("recording_url").in("alert_id", alertIds);
    const paths = (pkgs ?? []).map((p) => p.recording_url as string | null).filter((p): p is string => Boolean(p));
    if (paths.length) await admin.storage.from("recordings").remove(paths);
  }

  const count = async (table: string, run: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await run;
    if (error) throw new Error(`reset ${table} failed`);
    return [table, n ?? 0] as const;
  };
  const cleared = Object.fromEntries(
    await Promise.all([
      count("notification_events", admin.from("notification_events").delete({ count: "exact" }).eq("jam_id", jamId)),
      count("health_signals", admin.from("health_signals").delete({ count: "exact" }).eq("jam_id", jamId)),
      count("live_locations", admin.from("live_locations").delete({ count: "exact" }).eq("jam_id", jamId)),
    ]),
  );
  // alert_responses and incident_packages cascade from alerts.
  const [, alertsCleared] = await count("alerts", admin.from("alerts").delete({ count: "exact" }).eq("jam_id", jamId));
  cleared.alerts = alertsCleared;

  return json({ ok: true, cleared });
});
