import { useEffect } from "react";
import { DEMO_ACTION_IDS, demoActions } from "@/features/demo/demoActions";
import { getDemoContext } from "@/features/demo/demoContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { AlertRow, JamChannel } from "@/lib/types";
import { notificationService } from "@/services";
import { currentUserId, resolveAlert, toSafetyAlert } from "./api";
import { resetDemoJam } from "./incidentApi";

/** The affected user's open alert in the demo Jam (read through RLS). */
async function openAlertForAffected() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Huddle isn't connected.");
  const { jamId, affectedUserId } = getDemoContext();
  const { data } = await supabase
    .from("alerts")
    .select("*")
    .eq("jam_id", jamId)
    .eq("affected_user_id", affectedUserId)
    .is("resolved_at", null)
    .maybeSingle();
  if (!data) throw new Error("No open alert for the affected user. Trigger one first.");
  return toSafetyAlert(data as AlertRow);
}

/**
 * P5's own demo actions (owner "alerts"). Registered by the Demo Control panel, which runs on the
 * presenter's phone; each change is broadcast so every phone in the Jam updates.
 */
export function useAlertDemoActions(channel: JamChannel | null) {
  useEffect(() => {
    const offs = [
      demoActions.register({
        id: DEMO_ACTION_IDS.resetDemo,
        label: "Reset demo",
        owner: "alerts",
        async run() {
          const { jamId } = getDemoContext();
          const result = await resetDemoJam(jamId);
          if (!result.ok) throw new Error(result.error);
          if (demoActions.has(DEMO_ACTION_IDS.resetLocations)) await demoActions.run(DEMO_ACTION_IDS.resetLocations);
          await channel?.send("demo_reset", { jamId, requestedBy: (await currentUserId()) ?? "unknown", timestamp: new Date().toISOString() });
        },
      }),
      demoActions.register({
        id: DEMO_ACTION_IDS.sendIncidentPackage,
        label: "Send incident package",
        owner: "alerts",
        async run() {
          const alert = await openAlertForAffected();
          const results = await notificationService.notifyContacts({ alertId: alert.id });
          const incident = results.find((r) => r.channel === "in_app" && r.status === "sent");
          const incidentId = /incident:([0-9a-f-]{36})/.exec(incident?.detail ?? "")?.[1];
          if (!incidentId) throw new Error(results.find((r) => r.status === "failed")?.detail ?? "Couldn't create the incident package.");
          await channel?.send("incident_created", {
            jamId: alert.jamId,
            alertId: alert.id,
            incidentId,
            affectedUserId: alert.affectedUserId,
            timestamp: new Date().toISOString(),
          });
          const failed = results.filter((r) => r.status === "failed");
          if (failed.length) throw new Error(`Package sent, but: ${failed.map((r) => r.detail).join("; ")}`);
        },
      }),
      demoActions.register({
        id: DEMO_ACTION_IDS.resolveIncident,
        label: "Resolve incident",
        owner: "alerts",
        async run() {
          const alert = await openAlertForAffected();
          const { error, updated } = await resolveAlert(alert.id);
          if (error) throw new Error(error);
          if (updated) await channel?.send("alert_updated", updated);
        },
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [channel]);
}
