// POST /functions/v1/advance-alert  { alertId }
//
// Idempotent escalation tick. Any Jam member's app calls it when an alert's next_deadline_at
// passes; this is how timers survive the affected phone closing. Safe to call repeatedly: it only
// advances when the deadline is due, and the update is compare-and-set on escalation_state.
//
// P4 owns the transition logic (see TODO). Order and deadlines (next_deadline_at):
//   CHECK_IN_SENT     + profiles.checkin_buffer_seconds (the person's own, set at sign-up)  -> GROUP_ALERT_SENT (in-app + ntfy)
//   GROUP_ALERT_SENT  + jams.group_response_timeout_seconds, nobody acknowledged             -> AI_CALL_STARTING
//                     (contact_only_alert or no ai_call_consent skips straight to CONTACTS_NOTIFIED)
//   AI_CALL_ACTIVE    + AI_CALL_SILENCE_TIMEOUT_S; the affected phone pushes the deadline out
//                     whenever the person speaks or taps, so it only fires after 45s of silence  -> CONTACTS_NOTIFIED
//   The person answering at any point -> USER_RESPONDED / AI_CALL_USER_RESPONDED; a member acknowledging the
//   group alert -> GROUP_MEMBER_ACKNOWLEDGED.
import { TERMINAL_ESCALATION_STATES } from "../_shared/constants.ts";
import { isUuid, json, requireUser, serve } from "../_shared/supabase.ts";

serve(async (req, body) => {
  const alertId = body.alertId;
  if (!isUuid(alertId)) return json({ ok: false, error: "invalid_alert_id" }, 400);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  // Read through RLS: only members of the alert's Jam can see it.
  const { data: alert, error } = await auth.supabase
    .from("alerts")
    .select("id, jam_id, escalation_state, next_deadline_at, resolved_at")
    .eq("id", alertId)
    .maybeSingle();
  if (error) return json({ ok: false, error: "lookup_failed" }, 500);
  if (!alert) return json({ ok: false, error: "not_found" }, 404);

  const state = alert.escalation_state as string;
  const isDue = alert.next_deadline_at !== null && new Date(alert.next_deadline_at).getTime() <= Date.now();
  if (TERMINAL_ESCALATION_STATES.includes(state) || alert.resolved_at || !isDue) {
    return json({ ok: true, advanced: false, state });
  }

  // TODO(P4): compute the next state with the pure transition function (copy it into _shared/
  // or keep the logic here), respecting emergency_preference and consents, then compare-and-set with adminClient() from _shared:
  //   const { data } = await adminClient().from("alerts")
  //     .update({ escalation_state: next.state, status: next.status, next_deadline_at: next.deadlineAt })
  //     .eq("id", alertId).eq("escalation_state", state).select().maybeSingle();
  //   if (!data) return json({ ok: true, advanced: false, state }); // someone else advanced first
  // When next.state === "CONTACTS_NOTIFIED" (45s of silence on the AI call, or the affected phone stopped
  // sending heartbeats): run the last step here on the server, so it works even if every app is closed.
  // It builds the incident package, calls + texts the contacts, and pings the group. Consent and
  // per-contact toggles are enforced inside; it's idempotent with the affected phone's own call-contacts.
  //   import { escalateToContacts } from "../_shared/contactEscalation.ts";
  //   const results = await escalateToContacts(adminClient(), alertId);
  // Then the caller broadcasts alert_updated (and incident_created with the package id) on jam:{jamId}.
  return json({ ok: true, advanced: false, state, reason: "not_implemented" });
});
