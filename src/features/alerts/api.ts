import { dispatchAlertEvent, refreshAlert } from "@/features/health/alertActions";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { AlertResponseKind, AlertRow, SafetyAlert } from "@/lib/types";

/** Data access for alert cards. Everything goes through RLS as the signed-in member. */

export const toSafetyAlert = (row: AlertRow): SafetyAlert => ({
  id: row.id,
  jamId: row.jam_id,
  affectedUserId: row.affected_user_id,
  riskScore: Number(row.risk_score),
  severity: row.severity,
  status: row.status,
  escalationState: row.escalation_state,
  reasons: Array.isArray(row.reasons) ? row.reasons : [],
  createdAt: row.created_at,
  nextDeadlineAt: row.next_deadline_at,
  acknowledgedAt: row.acknowledged_at,
  resolvedAt: row.resolved_at,
});

const ALERT_COLUMNS =
  "id, jam_id, affected_user_id, risk_score, severity, status, escalation_state, reasons, next_deadline_at, created_at, acknowledged_at, resolved_at";

export async function currentUserId(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function listOpenAlerts(jamId: string): Promise<SafetyAlert[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("alerts")
    .select(ALERT_COLUMNS)
    .eq("jam_id", jamId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => toSafetyAlert(row as AlertRow));
}

/** userId -> display name for everyone in the Jam (member_profiles never exposes phone numbers). */
export async function getMemberNames(jamId: string): Promise<Record<string, string>> {
  const supabase = getSupabaseClient();
  if (!supabase) return {};
  const { data: members } = await supabase.from("jam_members").select("user_id").eq("jam_id", jamId);
  const ids = (members ?? []).map((m) => m.user_id as string);
  if (ids.length === 0) return {};
  const { data: profiles } = await supabase.from("member_profiles").select("id, display_name").in("id", ids);
  return Object.fromEntries((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));
}

export type LastSeen = { latitude: number; longitude: number; lastSeenAt: string; activity: string | null };

/** Null when they don't share location (RLS hides the row). */
export async function getLastSeen(jamId: string, userId: string): Promise<LastSeen | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("live_locations")
    .select("latitude, longitude, last_seen_at, activity")
    .eq("jam_id", jamId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? { latitude: data.latitude, longitude: data.longitude, lastSeenAt: data.last_seen_at, activity: data.activity } : null;
}

export async function listResponses(alertIds: string[]): Promise<{ alertId: string; userId: string; kind: AlertResponseKind }[]> {
  const supabase = getSupabaseClient();
  if (!supabase || alertIds.length === 0) return [];
  const { data } = await supabase.from("alert_responses").select("alert_id, user_id, kind").in("alert_id", alertIds);
  return (data ?? []).map((r) => ({ alertId: r.alert_id, userId: r.user_id, kind: r.kind }));
}

/** alertId -> incident package id, for packages this member may read. */
export async function getIncidentIds(alertIds: string[]): Promise<Record<string, string>> {
  const supabase = getSupabaseClient();
  if (!supabase || alertIds.length === 0) return {};
  const { data } = await supabase.from("incident_packages").select("id, alert_id").in("alert_id", alertIds).is("deleted_at", null);
  return Object.fromEntries((data ?? []).map((p) => [p.alert_id as string, p.id as string]));
}

/** Records a response once per user and kind (the DB unique index makes repeats no-ops). */
export async function respond(alertId: string, kind: AlertResponseKind): Promise<string | null> {
  const supabase = getSupabaseClient();
  const userId = await currentUserId();
  if (!supabase || !userId) return "You're signed out.";
  const { error } = await supabase.from("alert_responses").insert({ alert_id: alertId, user_id: userId, kind });
  if (error && error.code !== "23505") return "Couldn't send your response. Try again.";
  return null;
}

/**
 * "I'm going to help": records acknowledged + responding and, while the alert is at the group step,
 * applies P4's GROUP_ACK transition (compare-and-set, so it never rewinds a later step; P4 broadcasts
 * alert_updated and pauses escalation).
 */
export async function acknowledgeAlert(alert: SafetyAlert): Promise<{ error: string | null; updated: SafetyAlert | null }> {
  if (!getSupabaseClient()) return { error: "Huddle isn't connected.", updated: null };
  const error = (await respond(alert.id, "acknowledged")) ?? (await respond(alert.id, "responding"));
  if (error) return { error, updated: null };
  const row = await refreshAlert(alert.id);
  if (!row || row.escalation_state !== "GROUP_ALERT_SENT") return { error: null, updated: row ? toSafetyAlert(row) : null };
  const updated = (await dispatchAlertEvent(row, { type: "GROUP_ACK" })) ?? (await refreshAlert(alert.id));
  return { error: null, updated: updated ? toSafetyAlert(updated) : null };
}

/** "Mark safe": resolves the alert for everyone through P4's RESOLVE transition. */
export async function resolveAlert(alertId: string): Promise<{ error: string | null; updated: SafetyAlert | null }> {
  if (!getSupabaseClient()) return { error: "Huddle isn't connected.", updated: null };
  await respond(alertId, "safe");
  const row = await refreshAlert(alertId);
  if (!row) return { error: "Couldn't find this alert. Pull to refresh and try again.", updated: null };
  if (row.resolved_at) return { error: null, updated: toSafetyAlert(row) };
  const updated = (await dispatchAlertEvent(row, { type: "RESOLVE" })) ?? (await refreshAlert(alertId));
  if (!updated?.resolved_at) return { error: "Couldn't resolve the alert. Try again.", updated: null };
  return { error: null, updated: toSafetyAlert(updated) };
}
