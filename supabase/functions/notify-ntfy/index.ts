// POST /functions/v1/notify-ntfy  { jamId, alertId } -> NotificationResult
//
// Publishes ONLY the fixed NTFY_MESSAGE to the Jam's random ntfy_topic. No health data,
// location, phone numbers, or recordings. Logs every attempt to notification_events.
//
// P5 owns this (see TODO).
import { isUuid, json, requireUser, serve } from "../_shared/supabase.ts";

serve(async (req, body) => {
  const { jamId, alertId } = body;
  if (!isUuid(jamId) || !isUuid(alertId)) return json({ error: "invalid_body" }, 400);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  // Membership check through RLS: non-members get no row.
  const { data: jam } = await auth.supabase.from("jams").select("id, ntfy_topic").eq("id", jamId).maybeSingle();
  if (!jam) return json({ error: "not_found" }, 404);

  // TODO(P5): import NTFY_MESSAGE from ../_shared/constants.ts and adminClient from ../_shared/supabase.ts.
  // POST NTFY_MESSAGE.message to `${Deno.env.get("NTFY_BASE_URL") ?? "https://ntfy.sh"}/${jam.ntfy_topic}` with header
  // Title: NTFY_MESSAGE.title (and Authorization: Bearer NTFY_TOKEN if set), ~5s timeout.
  // Insert { jam_id, alert_id, channel: "ntfy", status, detail } into notification_events with adminClient().
  // On failure return { channel: "ntfy", status: "failed" } so the app shows the in-app fallback.
  return json({ channel: "ntfy", status: "skipped", detail: "Not implemented yet" });
});
