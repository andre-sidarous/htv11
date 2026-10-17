// POST /functions/v1/ai-phone-call  { alertId } -> { mode: "phone", status } | { mode: "app", reason }
//
// Starts the live AI support PHONE call for an alert at the AI-call step (idempotent: one call per
// alert). Any member of the Jam may trigger it; it always rings the AFFECTED person's own number.
// mode "app" means no call was placed (no phone number, Twilio not set up, ...): the app then runs
// the in-app spoken call instead.
import { startAiPhoneCall } from "../_shared/aiPhoneCall.ts";
import { adminClient, isUuid, json, requireUser, serve } from "../_shared/supabase.ts";

serve(async (req, body) => {
  const alertId = body.alertId;
  if (!isUuid(alertId)) return json({ mode: "app", reason: "invalid_alert_id" }, 400);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  // Members only (RLS): non-members can't see the alert.
  const { data: visible } = await auth.supabase.from("alerts").select("id").eq("id", alertId).maybeSingle();
  if (!visible) return json({ mode: "app", reason: "not_found" }, 404);

  return json(await startAiPhoneCall(adminClient(), alertId));
});
