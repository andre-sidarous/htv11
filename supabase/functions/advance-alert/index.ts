// POST /functions/v1/advance-alert  { alertId } -> { ok, advanced, state, alert? }
//
// Idempotent escalation tick. Any Jam member's app calls it when an alert's next_deadline_at
// passes; this is how timers survive the affected phone closing. Safe to call repeatedly: it only
// advances when the deadline is due, and the update is compare-and-set on escalation_state.
//
// Order and deadlines (next_deadline_at):
//   CHECK_IN_SENT     + profiles.checkin_buffer_seconds (the person's own, set at sign-up)  -> GROUP_ALERT_SENT (in-app + ntfy)
//   GROUP_ALERT_SENT  + jams.group_response_timeout_seconds, nobody acknowledged             -> AI_CALL_STARTING
//                     (contact_only_alert or no ai_call_consent skips straight to CONTACTS_NOTIFIED)
//   AI_CALL_ACTIVE    + AI_CALL_SILENCE_TIMEOUT_S; the affected phone pushes the deadline out
//                     whenever the person speaks or taps, so it only fires after 10s of silence  -> CONTACTS_NOTIFIED
//   The person answering at any point -> USER_RESPONDED / AI_CALL_USER_RESPONDED; a member acknowledging the
//   group alert -> GROUP_MEMBER_ACKNOWLEDGED.
// The caller broadcasts alert_updated (and incident_created when `incidentId` is returned) on jam:{jamId}.
import { TERMINAL_ESCALATION_STATES } from "../_shared/constants.ts";
import { escalationConfigFor, transition, type EscalationState } from "../_shared/escalation.ts";
import { escalateToContacts } from "../_shared/contactEscalation.ts";
import { adminClient, isUuid, json, requireUser, serve } from "../_shared/supabase.ts";

serve(async (req, body) => {
  const alertId = body.alertId;
  if (!isUuid(alertId)) return json({ ok: false, error: "invalid_alert_id" }, 400);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  // Read through RLS: only members of the alert's Jam can see it.
  const { data: alert, error } = await auth.supabase
    .from("alerts")
    .select("id, jam_id, affected_user_id, escalation_state, next_deadline_at, resolved_at")
    .eq("id", alertId)
    .maybeSingle();
  if (error) return json({ ok: false, error: "lookup_failed" }, 500);
  if (!alert) return json({ ok: false, error: "not_found" }, 404);

  const state = alert.escalation_state as EscalationState;
  const now = Date.now();
  const isDue = alert.next_deadline_at !== null && new Date(alert.next_deadline_at).getTime() <= now;
  if (TERMINAL_ESCALATION_STATES.includes(state) || alert.resolved_at || !isDue) {
    return json({ ok: true, advanced: false, state });
  }

  // The caller is authorized (they can see the alert). Policy inputs come from the DB, not the caller.
  const admin = adminClient();
  const [{ data: jam }, { data: member }] = await Promise.all([
    admin.from("jams").select("checkin_delay_seconds, group_response_timeout_seconds").eq("id", alert.jam_id).maybeSingle(),
    admin
      .from("jam_members")
      .select("emergency_preference, ai_call_consent")
      .eq("jam_id", alert.jam_id)
      .eq("user_id", alert.affected_user_id)
      .maybeSingle(),
  ]);

  const config = escalationConfigFor({
    checkinDelaySeconds: jam?.checkin_delay_seconds,
    groupResponseTimeoutSeconds: jam?.group_response_timeout_seconds,
    emergencyPreference: member?.emergency_preference,
    aiCallConsent: member?.ai_call_consent,
  });

  const next = transition(state, { type: "DEADLINE" }, now, config);
  if (!next) {
    // A due deadline with no timed transition: clear it so members stop ticking.
    await admin.from("alerts").update({ next_deadline_at: null }).eq("id", alertId).eq("escalation_state", state);
    return json({ ok: true, advanced: false, state, reason: "no_transition" });
  }

  const { data: updated, error: updateError } = await admin
    .from("alerts")
    .update({
      escalation_state: next.state,
      status: next.status,
      next_deadline_at: next.deadlineAt,
      ...(next.resolvedAt ? { resolved_at: next.resolvedAt } : {}),
    })
    .eq("id", alertId)
    .eq("escalation_state", state)
    .is("resolved_at", null)
    .select()
    .maybeSingle();
  if (updateError) return json({ ok: false, error: "update_failed" }, 500);
  if (!updated) return json({ ok: true, advanced: false, state, reason: "already_advanced" });

  if (next.state === "CONTACTS_NOTIFIED") {
    // Last step on the server, so it works even if every app is closed: incident package, call + text the
    // contacts, ping the group. Consent and per-contact toggles are enforced inside; idempotent with call-contacts.
    const results = await escalateToContacts(admin, alertId);
    const incidentId = results
      .map((r) => (typeof r.detail === "string" && r.detail.startsWith("incident:") ? r.detail.slice("incident:".length) : null))
      .find(Boolean);
    return json({ ok: true, advanced: true, state: next.state, alert: updated, results, incidentId: incidentId ?? null });
  }

  return json({ ok: true, advanced: true, state: next.state, alert: updated });
});
