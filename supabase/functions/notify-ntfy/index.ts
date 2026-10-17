// POST /functions/v1/notify-ntfy  { jamId, alertId } -> NotificationResult
//
// Group push at GROUP_ALERT_SENT. Publishes ONLY the fixed NTFY_MESSAGE to the Jam's random
// ntfy_topic (no health data, location, phone numbers, or recordings) and logs the attempt.
// On failure the app keeps showing the in-app alert and the failed status.
import { publishNtfy } from "../_shared/ntfy.ts";
import { adminClient, isUuid, json, requireUser, serve } from "../_shared/supabase.ts";

serve(async (req, body) => {
  const { jamId, alertId } = body;
  if (!isUuid(jamId) || !isUuid(alertId)) return json({ error: "invalid_body" }, 400);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  // Membership check through RLS: non-members get no row.
  const { data: jam } = await auth.supabase.from("jams").select("id, ntfy_topic").eq("id", jamId).maybeSingle();
  if (!jam) return json({ error: "not_found" }, 404);
  const { data: alert } = await auth.supabase.from("alerts").select("id").eq("id", alertId).eq("jam_id", jamId).maybeSingle();
  if (!alert) return json({ error: "not_found" }, 404);

  return json(await publishNtfy(adminClient(), jam, alertId));
});
