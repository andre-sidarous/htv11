import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Deletes every incident package created for the caller as the affected user, in one Jam.
 * Uses the `delete_incident_package` RPC (soft delete: wipes the payload, keeps the row as a
 * tombstone). Settings surfaces this as a privacy control; P4/P5 own the incident data itself.
 */
export async function deleteMyIncidentData(jamId: string, userId: string): Promise<{ deleted: number; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { deleted: 0, error: "Supabase is not configured." };

  const { data: alerts, error: alertsError } = await supabase
    .from("alerts")
    .select("id")
    .eq("jam_id", jamId)
    .eq("affected_user_id", userId);
  if (alertsError) return { deleted: 0, error: alertsError.message };

  const alertIds = (alerts ?? []).map((a) => a.id);
  if (alertIds.length === 0) return { deleted: 0, error: null };

  const { data: packages, error: packagesError } = await supabase
    .from("incident_packages")
    .select("id")
    .in("alert_id", alertIds)
    .is("deleted_at", null);
  if (packagesError) return { deleted: 0, error: packagesError.message };

  let deleted = 0;
  for (const pkg of packages ?? []) {
    const { error } = await supabase.rpc("delete_incident_package", { p_id: pkg.id });
    if (error) return { deleted, error: error.message };
    deleted += 1;
  }
  return { deleted, error: null };
}
