import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto";
import { DEFAULT_INCIDENT_RETENTION_HOURS, RECORDINGS_BUCKET } from "@/lib/constants";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { IncidentPackage, IncidentPackageRow, IncidentService } from "@/lib/types";

/** Recording references that aren't real Storage objects (permission denied / demo). */
export const SIMULATED_RECORDING_PREFIX = "simulated://";

const COLUMNS =
  "id, alert_id, affected_user_id, location_snapshot, health_summary, route_summary, recording_url, recipients, retention_hours, expires_at, deleted_at, created_at";

function toPackage(row: Omit<IncidentPackageRow, "access_token_hash">): IncidentPackage {
  return {
    id: row.id,
    alertId: row.alert_id,
    affectedUserId: row.affected_user_id,
    locationSnapshot: row.location_snapshot as IncidentPackage["locationSnapshot"],
    healthSummary: row.health_summary,
    routeSummary: row.route_summary,
    recordingUrl: row.recording_url,
    recipients: row.recipients,
    retentionHours: row.retention_hours,
    expiresAt: row.expires_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

function db() {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}

/**
 * Incident packages in Postgres (RLS: the affected user and listed member recipients read).
 * External contacts get a random token; only its SHA-256 hex is stored (`access_token_hash`).
 */
export const supabaseIncidentService: IncidentService = {
  async createPackage(input) {
    const retentionHours = Math.min(720, Math.max(1, Math.round(input.retentionHours || DEFAULT_INCIDENT_RETENTION_HOURS)));
    const accessToken = randomUUID();
    const accessTokenHash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, accessToken);
    const expiresAt = new Date(Date.now() + retentionHours * 3_600_000).toISOString();

    const { data, error } = await db()
      .from("incident_packages")
      .insert({
        alert_id: input.alertId,
        affected_user_id: input.affectedUserId,
        location_snapshot: input.locationSnapshot,
        health_summary: input.healthSummary,
        route_summary: input.routeSummary,
        recording_url: input.recordingUrl,
        recipients: input.recipients,
        access_token_hash: accessTokenHash,
        retention_hours: retentionHours,
        expires_at: expiresAt,
      })
      .select(COLUMNS)
      .single();
    if (error || !data) throw new Error(error?.message ?? "Couldn't create the incident package.");
    return { incident: toPackage(data as IncidentPackageRow), accessToken };
  },

  async getPackage(id) {
    const { data } = await db().from("incident_packages").select(COLUMNS).eq("id", id).maybeSingle();
    return data ? toPackage(data as IncidentPackageRow) : null;
  },

  async deletePackage(id) {
    const { data: recordingPath, error } = await db().rpc("delete_incident_package", { p_id: id });
    if (error) throw new Error(error.message);
    if (recordingPath && !recordingPath.startsWith(SIMULATED_RECORDING_PREFIX)) {
      const { error: removeError } = await db().storage.from(RECORDINGS_BUCKET).remove([recordingPath]);
      if (removeError) console.warn("[incident] recording removal failed", removeError.message);
    }
  },
};
