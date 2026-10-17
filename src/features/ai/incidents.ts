import { dispatchAlertEvent } from "@/features/health/alertActions";
import { alertRepository } from "@/features/health/alertRepository";
import { broadcast, safetyStore } from "@/features/health/safetyStore";
import { getCurrentUserId } from "@/features/health/useCurrentUserId";
import { DEFAULT_INCIDENT_RETENTION_HOURS } from "@/lib/constants";
import { mockServicesEnabled } from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { IncidentPackage, IncidentRecipient } from "@/lib/types";
import { heartRateIncreasePct } from "@/services/risk/engine";
import { incidentService } from "@/services/incident";

/**
 * Builds the incident package when the affected user stays unresponsive. Runs on the affected
 * phone when it's alive (it alone can read its trusted contacts and has the recording); otherwise
 * the phone that advanced the alert builds a members-only package. Never contacts emergency services.
 */

const inflight = new Map<string, Promise<string | null>>();
const pendingRecordings = new Map<string, Promise<string | null>>();
/** Raw access tokens for packages created on THIS phone (only the hash is stored server-side). */
const accessTokens = new Map<string, { incidentId: string; token: string }>();

const RECORDING_WAIT_MS = 15_000;

/** The support-call screen registers its recording upload so the package can reference it. */
export function registerRecording(alertId: string, reference: Promise<string | null>) {
  pendingRecordings.set(alertId, reference);
}

export type IncidentAccess = { incidentId: string; token: string };

/** Detail of the notification_events row written by the incident-token Edge Function. */
type IncidentAccessDetail = IncidentAccess & { type: "incident_access" };

/**
 * For P5's "Send incident package" / SMS preview: the external-contact token for an alert's
 * package, on ANY member's phone. Checks this phone first, then the notification_events row
 * (channel "sms_preview", status "skipped") saved by the incident-token Edge Function.
 * Show it as the /incident/[token] link.
 */
export async function getIncidentAccess(alertId: string): Promise<IncidentAccess | null> {
  const local = accessTokens.get(alertId);
  if (local) return local;
  if (mockServicesEnabled) return null;
  const { data } = (await getSupabaseClient()
    ?.from("notification_events")
    .select("detail")
    .eq("alert_id", alertId)
    .eq("channel", "sms_preview")
    .order("created_at", { ascending: false })
    .limit(10)) ?? { data: null };
  for (const row of data ?? []) {
    try {
      const detail = JSON.parse(row.detail ?? "") as Partial<IncidentAccessDetail>;
      if (detail.type === "incident_access" && detail.incidentId && detail.token) {
        return { incidentId: detail.incidentId, token: detail.token };
      }
    } catch {
      // Other sms_preview rows (P5's) aren't JSON; skip them.
    }
  }
  return null;
}

/** Save the token server-side so other phones (presenter 1 / P5's panel) can share the link. */
async function saveIncidentAccess(access: IncidentAccess) {
  const supabase = getSupabaseClient();
  if (!supabase || mockServicesEnabled) return;
  try {
    const { error } = await supabase.functions.invoke("incident-token", {
      body: { incidentId: access.incidentId, accessToken: access.token },
    });
    if (error) console.warn("[incident] token save failed", error.message);
  } catch (error) {
    console.warn("[incident] token save failed", error);
  }
}

const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T) =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

async function existingPackageId(alertId: string): Promise<string | null> {
  if (mockServicesEnabled) return null;
  const { data } = (await getSupabaseClient()
    ?.from("incident_packages")
    .select("id")
    .eq("alert_id", alertId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle()) ?? { data: null };
  return data?.id ?? null;
}

async function consentedContacts(ownerId: string): Promise<IncidentRecipient[]> {
  if (mockServicesEnabled) return [];
  const { data } = (await getSupabaseClient()
    ?.from("trusted_contacts")
    .select("id, confirmation_status")
    .eq("owner_user_id", ownerId)
    .neq("confirmation_status", "declined")) ?? { data: null };
  return (data ?? []).map((c) => ({ type: "contact" as const, contactId: c.id }));
}

async function lastKnownLocation(jamId: string, userId: string): Promise<IncidentPackage["locationSnapshot"]> {
  const local = safetyStore.get().locations[userId];
  if (local) {
    return { latitude: local.latitude, longitude: local.longitude, accuracy: local.accuracy, capturedAt: local.timestamp };
  }
  if (mockServicesEnabled) return null;
  // Latest row only (never history). RLS returns it only if the member consented to sharing.
  const { data } = (await getSupabaseClient()
    ?.from("live_locations")
    .select("latitude, longitude, accuracy, last_seen_at")
    .eq("jam_id", jamId)
    .eq("user_id", userId)
    .maybeSingle()) ?? { data: null };
  return data
    ? { latitude: data.latitude, longitude: data.longitude, accuracy: data.accuracy ?? undefined, capturedAt: data.last_seen_at }
    : null;
}

/** Create the package once per alert (deduped per phone, then via the DB and incident_created). */
export function ensureIncidentPackage(alertId: string): Promise<string | null> {
  const known = safetyStore.get().incidents[alertId];
  if (known) return Promise.resolve(known);
  const running = inflight.get(alertId);
  if (running) return running;

  const job = (async () => {
    const alert = await alertRepository.get(alertId);
    if (!alert) return null;
    const existing = await existingPackageId(alertId).catch(() => null);
    if (existing) {
      safetyStore.set((s) => ({ incidents: { ...s.incidents, [alertId]: existing } }));
      return existing;
    }

    const me = await getCurrentUserId();
    const isAffected = me === alert.affected_user_id;
    const policy = await alertRepository.policy(alert.jam_id, alert.affected_user_id);
    const snapshot = safetyStore.get();

    const recordingUrl =
      isAffected && policy.consents.recording && pendingRecordings.has(alertId)
        ? await withTimeout(pendingRecordings.get(alertId)!, RECORDING_WAIT_MS, null)
        : null;

    const members = (await alertRepository.memberIds(alert.jam_id, alert.affected_user_id)).map(
      (userId): IncidentRecipient => ({ type: "member", userId }),
    );
    const contacts = isAffected && policy.consents.contactNotify ? await consentedContacts(alert.affected_user_id) : [];

    const signal = isAffected && policy.consents.health ? snapshot.lastSignal : null;
    const route = snapshot.routeStatus[alert.affected_user_id];

    const { incident, accessToken } = await incidentService.createPackage({
      alertId,
      affectedUserId: alert.affected_user_id,
      locationSnapshot: await lastKnownLocation(alert.jam_id, alert.affected_user_id),
      healthSummary: {
        source: "simulated",
        riskScore: Number(alert.risk_score),
        severity: alert.severity,
        reasons: alert.reasons,
        lastResponseAt: isAffected ? snapshot.lastResponseAt : null,
        ...(signal
          ? {
              heartRate: signal.heartRate ?? null,
              baselineHeartRate: signal.baselineHeartRate ?? null,
              percentAboveBaseline: heartRateIncreasePct(signal.heartRate, signal.baselineHeartRate),
              activity: signal.activity ?? null,
              movementState: signal.movementState ?? null,
            }
          : {}),
      },
      routeSummary: route
        ? { level: route.level, distanceFromRouteM: Math.round(route.distanceFromRouteM), isDemoRoute: route.isDemoRoute }
        : null,
      recordingUrl,
      recipients: [...members, ...contacts],
      retentionHours: DEFAULT_INCIDENT_RETENTION_HOURS,
    });

    accessTokens.set(alertId, { incidentId: incident.id, token: accessToken });
    await saveIncidentAccess({ incidentId: incident.id, token: accessToken });
    safetyStore.set((s) => ({ incidents: { ...s.incidents, [alertId]: incident.id } }));
    await broadcast(alert.jam_id, "incident_created", {
      jamId: alert.jam_id,
      alertId,
      incidentId: incident.id,
      affectedUserId: alert.affected_user_id,
      timestamp: new Date().toISOString(),
    });

    const latest = await alertRepository.get(alertId);
    if (latest?.escalation_state === "AI_CALL_USER_UNRESPONSIVE") await dispatchAlertEvent(latest, { type: "NOTIFY_CONTACTS" });
    return incident.id;
  })().finally(() => inflight.delete(alertId));

  inflight.set(alertId, job);
  return job;
}
