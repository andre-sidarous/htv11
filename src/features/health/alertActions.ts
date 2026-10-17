import type { AlertRow, EscalationState, RiskEvaluation } from "@/lib/types";
import { startAiPhoneCall } from "@/lib/supabase/functions";
import { notificationService } from "@/services/notification";
import { alertRepository, toSafetyAlert, type AlertPatch } from "./alertRepository";
import { transition, type EscalationEvent } from "./escalation";
import { broadcast, safetyStore } from "./safetyStore";
import { getCurrentUserId } from "./useCurrentUserId";

/**
 * Everything that moves an alert. All changes are compare-and-set, so only one phone "wins"
 * each transition; the winner broadcasts alert_updated and runs that transition's side effects.
 * P5: acknowledge with `dispatchAlertEvent(alert, { type: "GROUP_ACK" })`.
 */

/** If a non-affected phone wins a transition into these states, it builds a members-only package
 * after this delay unless the affected phone already did (incident_created). */
const INCIDENT_FALLBACK_DELAY_MS = 6_000;

const entered = (prev: EscalationState, next: AlertRow, ...states: EscalationState[]) =>
  prev !== next.escalation_state && states.includes(next.escalation_state);

async function afterTransition(prevState: EscalationState, next: AlertRow, { byServer = false } = {}) {
  safetyStore.putAlert(next);
  await broadcast(next.jam_id, "alert_updated", toSafetyAlert(next));

  // advance-alert already called and texted the contacts when the server made this move. When a phone
  // made it (AI call silence, demo "Simulate AI non-response"), run the same Twilio step via call-contacts.
  // It reuses this alert's incident package and skips anyone already called, so repeats are harmless.
  // advance-alert rings the phone itself when the server makes this move.
  if (!byServer && entered(prevState, next, "AI_CALL_STARTING")) {
    void startAiPhoneCall(next.id).catch((error) => console.warn("[alerts] AI phone call failed to start", error));
  }

  if (!byServer && entered(prevState, next, "CONTACTS_NOTIFIED")) {
    void notificationService
      .notifyContacts({ alertId: next.id })
      .then((results) => results.filter((r) => r.status === "failed").forEach((r) => console.warn("[alerts] contact", r.channel, r.detail)))
      .catch((error) => console.warn("[alerts] notifyContacts failed", error));
  }

  if (entered(prevState, next, "GROUP_ALERT_SENT", "CONTACTS_NOTIFIED")) {
    void notificationService
      .notifyGroup({ jamId: next.jam_id, alertId: next.id })
      .catch((error) => console.warn("[alerts] notifyGroup failed", error));
  }

  if (entered(prevState, next, "AI_CALL_USER_UNRESPONSIVE", "CONTACTS_NOTIFIED")) {
    const me = await getCurrentUserId();
    if (me && me !== next.affected_user_id) {
      setTimeout(() => {
        if (safetyStore.get().incidents[next.id]) return;
        // Lazy import: incidents.ts imports dispatchAlertEvent from here, so a static import is a require cycle.
        void import("@/features/ai/incidents")
          .then(({ ensureIncidentPackage }) => ensureIncidentPackage(next.id))
          .catch(() => {});
      }, INCIDENT_FALLBACK_DELAY_MS);
    }
  }
}

/** Apply an event to an alert. Returns the updated row, or null if invalid or someone moved first. */
export async function dispatchAlertEvent(alert: AlertRow, event: EscalationEvent): Promise<AlertRow | null> {
  const policy = await alertRepository.policy(alert.jam_id, alert.affected_user_id);
  const now = Date.now();
  const next = transition(alert.escalation_state, event, now, policy.config);
  if (!next) return null;

  const patch: AlertPatch = {
    escalation_state: next.state,
    status: next.status,
    next_deadline_at: next.deadlineAt,
    ...(next.resolvedAt ? { resolved_at: next.resolvedAt } : {}),
    ...(event.type === "GROUP_ACK" ? { acknowledged_at: new Date(now).toISOString() } : {}),
  };
  const updated = await alertRepository.update(alert.id, alert.escalation_state, patch);
  if (!updated) {
    await refreshAlert(alert.id);
    return null;
  }
  await afterTransition(alert.escalation_state, updated);
  return updated;
}

/** Re-read the latest open alert for a user and apply the event to it. */
export async function dispatchForUser(jamId: string, userId: string, event: EscalationEvent): Promise<AlertRow | null> {
  const alert = await openAlertForUser(jamId, userId);
  return alert ? dispatchAlertEvent(alert, event) : null;
}

/** Deadline passed: ask the server (works even if the affected phone is closed). Idempotent. */
export async function advanceDueAlert(alert: AlertRow): Promise<AlertRow | null> {
  const result = await alertRepository.advance(alert.id);
  if (result.advanced && result.alert) {
    await afterTransition(alert.escalation_state, result.alert, { byServer: true });
    return result.alert;
  }
  await refreshAlert(alert.id);
  return null;
}

export async function refreshAlert(id: string): Promise<AlertRow | null> {
  const row = await alertRepository.get(id).catch(() => null);
  if (row) safetyStore.putAlert(row);
  return row;
}

export async function refreshOpenAlerts(jamId: string): Promise<AlertRow[]> {
  const rows = await alertRepository.listOpen(jamId);
  safetyStore.replaceAlerts(rows);
  return rows;
}

export async function openAlertForUser(jamId: string, userId: string): Promise<AlertRow | null> {
  const rows = await refreshOpenAlerts(jamId).catch(() => Object.values(safetyStore.get().alerts));
  return rows.find((a) => a.jam_id === jamId && a.affected_user_id === userId && !a.resolved_at) ?? null;
}

/**
 * Open an alert at CHECK_IN_SENT (MONITORING → CHECK_IN_SENT) and ask the user "Are you okay?".
 * The DB allows one open alert per member: a duplicate (23505) is a no-op that returns the existing one.
 */
export async function createCheckInAlert(input: {
  jamId: string;
  userId: string;
  evaluation: Pick<RiskEvaluation, "riskScore" | "severity" | "reasons">;
  requestedBy: string;
}): Promise<AlertRow | null> {
  const policy = await alertRepository.policy(input.jamId, input.userId);
  const next = transition("MONITORING", { type: "CHECK_IN" }, Date.now(), policy.config)!;
  const result = await alertRepository.create({
    jam_id: input.jamId,
    affected_user_id: input.userId,
    risk_score: input.evaluation.riskScore,
    severity: input.evaluation.severity,
    reasons: input.evaluation.reasons,
    escalation_state: next.state,
    status: next.status,
    next_deadline_at: next.deadlineAt,
  });

  if ("duplicate" in result) return openAlertForUser(input.jamId, input.userId);
  if ("error" in result) {
    console.warn("[alerts] create failed", result.error);
    return null;
  }

  const alert = result.alert;
  safetyStore.putAlert(alert);
  await broadcast(alert.jam_id, "alert_created", toSafetyAlert(alert));
  await broadcast(alert.jam_id, "checkin_requested", {
    jamId: alert.jam_id,
    targetUserId: alert.affected_user_id,
    alertId: alert.id,
    requestedBy: input.requestedBy,
    reason: "risk",
    deadlineAt: alert.next_deadline_at ?? undefined,
    timestamp: new Date().toISOString(),
  });
  return alert;
}

/** Keep the open alert's score and reasons current (affected phone only; state is untouched). */
export async function updateAlertRisk(alert: AlertRow, evaluation: RiskEvaluation): Promise<void> {
  const sameReasons = JSON.stringify(alert.reasons) === JSON.stringify(evaluation.reasons);
  if (Number(alert.risk_score) === evaluation.riskScore && alert.severity === evaluation.severity && sameReasons) return;
  const updated = await alertRepository
    .update(alert.id, alert.escalation_state, {
      risk_score: evaluation.riskScore,
      severity: evaluation.severity,
      reasons: evaluation.reasons,
    })
    .catch(() => null);
  if (!updated) return;
  safetyStore.putAlert(updated);
  await broadcast(updated.jam_id, "alert_updated", toSafetyAlert(updated));
}
