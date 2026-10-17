// POST /functions/v1/call-contacts  { alertId, recordingPath? } -> { results: NotificationResult[] }
//
// Last escalation step (10s of silence on the AI support call): builds the incident package,
// phones and texts the affected user's trusted contacts (Twilio), and pings the group (ntfy).
// The affected phone calls this with its uploaded recording; any member may call it (Demo Control).
// Idempotent, so repeats are safe. advance-alert runs the same step server-side as a fallback.
//
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, NTFY_BASE_URL, NTFY_TOKEN.
import { escalateToContacts } from "../_shared/contactEscalation.ts";
import { adminClient, isUuid, json, requireUser, serve } from "../_shared/supabase.ts";

serve(async (req, body) => {
  const alertId = body.alertId;
  if (!isUuid(alertId)) return json({ error: "invalid_alert_id" }, 400);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  // Authorization through RLS: only members of the alert's Jam can see it.
  const { data: alert } = await auth.supabase.from("alerts").select("id, affected_user_id").eq("id", alertId).maybeSingle();
  if (!alert) return json({ error: "not_found" }, 404);

  // Only the affected user attaches their own recording.
  const recordingPath = alert.affected_user_id === auth.user.id ? body.recordingPath : undefined;
  return json({ results: await escalateToContacts(adminClient(), alertId, { recordingPath }) });
});
