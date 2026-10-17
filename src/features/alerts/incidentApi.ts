import { getSupabaseClient } from "@/lib/supabase/client";

/** Client side of supabase/functions/incident-access and demo-reset. Never throws. */

export type IncidentRole = "self" | "member" | "contact";

export type IncidentView = {
  id: string;
  alertId: string;
  jamId: string | null;
  role: IncidentRole;
  personName: string;
  createdAt: string;
  alertCreatedAt: string | null;
  expiresAt: string;
  retentionHours: number;
  alertResolved: boolean;
  location: { latitude: number; longitude: number; accuracy?: number; capturedAt?: string; place?: string | null } | null;
  health: {
    heartRate?: number | null;
    baselineHeartRate?: number | null;
    activity?: string | null;
    movementState?: string | null;
    capturedAt?: string | null;
  } | null;
  reasons: string[] | null;
  destinationName: string | null;
  hasRecording: boolean;
  recordingUrl: string | null;
  sharedWith: { members: string[]; contacts: number };
  canDelete: boolean;
  canResolve: boolean;
};

export type IncidentSummary = { id: string; role: IncidentRole; personName: string; createdAt: string };

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: "Jam isn't connected." };
  try {
    const { data, error } = await supabase.functions.invoke<T>(name, { body });
    return { data: data ?? null, error: error ? error.message : null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Request failed" };
  }
}

export async function getIncident(incidentId: string): Promise<{ incident: IncidentView | null; error: string | null }> {
  const { data, error } = await invoke<{ incident: IncidentView }>("incident-access", { incidentId });
  if (data?.incident) return { incident: data.incident, error: null };
  return { incident: null, error: error && !/404|non-2xx/i.test(error) ? "Couldn't load this incident. Try again." : null };
}

export async function listSharedIncidents(): Promise<{ incidents: IncidentSummary[]; error: string | null }> {
  const { data, error } = await invoke<{ incidents: IncidentSummary[] }>("incident-access", {});
  return { incidents: data?.incidents ?? [], error: data ? null : error ? "Couldn't load incidents. Try again." : null };
}

export async function deleteIncident(incidentId: string): Promise<string | null> {
  const { data } = await invoke<{ deleted: boolean }>("incident-access", { incidentId, action: "delete" });
  return data?.deleted ? null : "Couldn't delete this incident. Try again.";
}

export type DemoResetResult = { ok: boolean; cleared?: Record<string, number>; error?: string };

export async function resetDemoJam(jamId: string): Promise<DemoResetResult> {
  const { data, error } = await invoke<DemoResetResult>("demo-reset", { jamId });
  if (data?.ok) return data;
  return { ok: false, error: data?.error === "host_only" ? "Only the Jam's host can reset the demo." : error ?? data?.error ?? "Reset failed" };
}
