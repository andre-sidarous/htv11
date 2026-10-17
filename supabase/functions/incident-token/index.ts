// POST /functions/v1/incident-token  { incidentId, accessToken } -> { ok, saved }
//
// Saves an incident package's external-contact access token as a notification_events row
// (channel "sms_preview", status "skipped": nothing is sent) so P5's "Send incident package" /
// SMS preview can show the /incident/[token] link on any member's phone.
//
// POC trade-off (team decision): Jam members can read notification_events, so the token is
// visible to them. They are already recipients of the full package; the token only opens the
// narrower contact view, and stops working when the package expires or is deleted.
//
// The token must hash to the package's access_token_hash, so callers can't plant arbitrary text.
import { adminClient, isUuid, json, requireUser, serve } from "../_shared/supabase.ts";

const INCIDENT_ACCESS_DETAIL_TYPE = "incident_access";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req, body) => {
  const { incidentId, accessToken } = body;
  if (!isUuid(incidentId) || !isUuid(accessToken)) return json({ ok: false, error: "invalid_body" }, 400);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  // RLS: only the affected user and listed member recipients can read the package.
  const { data: incident } = await auth.supabase
    .from("incident_packages")
    .select("id, alert_id, access_token_hash")
    .eq("id", incidentId)
    .maybeSingle();
  if (!incident) return json({ ok: false, error: "not_found" }, 404);
  if (!incident.access_token_hash || incident.access_token_hash !== (await sha256Hex(accessToken))) {
    return json({ ok: false, error: "token_mismatch" }, 403);
  }

  const admin = adminClient();
  const { data: alert } = await admin.from("alerts").select("jam_id").eq("id", incident.alert_id).maybeSingle();
  if (!alert) return json({ ok: false, error: "not_found" }, 404);

  const detail = JSON.stringify({ type: INCIDENT_ACCESS_DETAIL_TYPE, incidentId, token: accessToken });

  // Idempotent: one row per package.
  const { data: existing } = await admin
    .from("notification_events")
    .select("id")
    .eq("alert_id", incident.alert_id)
    .eq("channel", "sms_preview")
    .eq("detail", detail)
    .limit(1)
    .maybeSingle();
  if (existing) return json({ ok: true, saved: false });

  const { error } = await admin.from("notification_events").insert({
    jam_id: alert.jam_id,
    alert_id: incident.alert_id,
    channel: "sms_preview",
    status: "skipped",
    detail,
  });
  if (error) return json({ ok: false, error: "insert_failed" }, 500);
  return json({ ok: true, saved: true });
});
