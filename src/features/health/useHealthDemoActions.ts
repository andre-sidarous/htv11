import { useEffect } from "react";
import { ensureIncidentPackage } from "@/features/ai/incidents";
import { DEMO_ACTION_IDS, demoActions } from "@/features/demo/demoActions";
import { getDemoContext } from "@/features/demo/demoContext";
import { campusWalk } from "@/lib/demo/campusWalk";
import type { AlertRow, DemoAction, EscalationState, HealthScenario } from "@/lib/types";
import { simulatedHealth } from "@/services/health";
import { signalFor } from "@/services/health/simulated";
import { dispatchAlertEvent, openAlertForUser } from "./alertActions";
import type { EscalationEvent } from "./escalation";
import { broadcast } from "./safetyStore";
import { getCurrentUserId } from "./useCurrentUserId";

/**
 * P4 demo actions (owner "health"). They run on the tapping phone (usually presenter 1's), so
 * everything targets getDemoContext() and reaches the affected user's phone by broadcast or
 * through the alerts row, never by local state alone.
 */

const DEMO_BASELINE = campusWalk.health.baselineHeartRate;

async function broadcastScenario(scenario: HealthScenario) {
  const { jamId, affectedUserId } = getDemoContext();
  // The affected phone adopts this (useSafetyEngine → health_update). If that's this phone, apply directly too.
  if ((await getCurrentUserId()) === affectedUserId) {
    simulatedHealth.setBaselineOverride(DEMO_BASELINE);
    simulatedHealth.setScenario(affectedUserId, scenario);
  }
  await broadcast(jamId, "health_update", signalFor({ jamId, userId: affectedUserId, scenario, baselineHeartRate: DEMO_BASELINE }));
}

async function requireAlert(): Promise<AlertRow> {
  const { jamId, affectedUserId } = getDemoContext();
  const alert = await openAlertForUser(jamId, affectedUserId);
  if (!alert) throw new Error("No open alert for the affected user yet. Trigger signals or send a check-in first.");
  return alert;
}

/** Walk the alert forward with these events in order, skipping ones that don't apply. */
async function drive(events: Partial<Record<EscalationState, EscalationEvent>>, target: EscalationState[]): Promise<AlertRow> {
  let alert = await requireAlert();
  for (let i = 0; i < 6 && !target.includes(alert.escalation_state); i++) {
    const event = events[alert.escalation_state];
    if (!event) throw new Error(`Not available while the alert is ${alert.escalation_state.toLowerCase().replaceAll("_", " ")}.`);
    const next = await dispatchAlertEvent(alert, event);
    alert = next ?? (await requireAlert());
  }
  return alert;
}

const routeDeviationFallback: DemoAction = {
  id: DEMO_ACTION_IDS.triggerRouteDeviation,
  label: "Trigger route deviation",
  owner: "health",
  async run() {
    // Used only when P3's map action isn't registered: report a deviation for the affected user.
    const { jamId, affectedUserId } = getDemoContext();
    await broadcast(jamId, "member_status", {
      jamId,
      userId: affectedUserId,
      routeStatus: { userId: affectedUserId, distanceFromRouteM: 260, level: "deviation", isDemoRoute: true },
      timestamp: new Date().toISOString(),
    });
  },
};

const ACTIONS: DemoAction[] = [
  { id: DEMO_ACTION_IDS.triggerHeartRateSpike, label: "Trigger heart-rate spike", owner: "health", run: () => broadcastScenario("heart_rate_spike") },
  { id: DEMO_ACTION_IDS.triggerRunning, label: "Trigger running", owner: "health", run: () => broadcastScenario("unexpected_running") },
  { id: DEMO_ACTION_IDS.triggerSuddenStop, label: "Trigger sudden stop", owner: "health", run: () => broadcastScenario("sudden_stop") },
  {
    id: DEMO_ACTION_IDS.sendCheckIn,
    label: "Send check-in",
    owner: "health",
    async run() {
      const { jamId, affectedUserId } = getDemoContext();
      const alert = await openAlertForUser(jamId, affectedUserId);
      await broadcast(jamId, "checkin_requested", {
        jamId,
        targetUserId: affectedUserId,
        alertId: alert?.id,
        requestedBy: (await getCurrentUserId()) ?? affectedUserId,
        reason: "risk",
        deadlineAt: alert?.next_deadline_at ?? undefined,
        timestamp: new Date().toISOString(),
      });
    },
  },
  {
    id: DEMO_ACTION_IDS.simulateNoResponse,
    label: "Simulate no response",
    owner: "health",
    run: async () => void (await drive({ CHECK_IN_SENT: { type: "DEADLINE" } }, ["GROUP_ALERT_SENT"])),
  },
  {
    id: DEMO_ACTION_IDS.simulateNoGroupResponse,
    label: "Simulate no group response",
    owner: "health",
    run: async () =>
      void (await drive(
        { CHECK_IN_SENT: { type: "DEADLINE" }, GROUP_ALERT_SENT: { type: "DEADLINE" }, GROUP_MEMBER_ACKNOWLEDGED: { type: "DEADLINE" } },
        ["AI_CALL_STARTING", "CONTACTS_NOTIFIED"],
      )),
  },
  {
    id: DEMO_ACTION_IDS.startAiCall,
    label: "Start AI call",
    owner: "health",
    run: async () =>
      void (await drive(
        { CHECK_IN_SENT: { type: "DEADLINE" }, GROUP_ALERT_SENT: { type: "START_AI_CALL" }, GROUP_MEMBER_ACKNOWLEDGED: { type: "START_AI_CALL" } },
        ["AI_CALL_STARTING", "AI_CALL_ACTIVE"],
      )),
  },
  {
    id: DEMO_ACTION_IDS.simulateAiResponse,
    label: "Simulate AI response",
    owner: "health",
    run: async () =>
      void (await drive(
        { AI_CALL_STARTING: { type: "AI_CALL_CONNECTED" }, AI_CALL_ACTIVE: { type: "AI_CALL_RESPONSE" } },
        ["AI_CALL_USER_RESPONDED"],
      )),
  },
  {
    id: DEMO_ACTION_IDS.simulateAiNonResponse,
    label: "Simulate AI non-response",
    owner: "health",
    run: async () =>
      void (await drive(
        { AI_CALL_STARTING: { type: "AI_CALL_CONNECTED" }, AI_CALL_ACTIVE: { type: "AI_CALL_NO_RESPONSE" } },
        ["AI_CALL_USER_UNRESPONSIVE", "CONTACTS_NOTIFIED"],
      )),
  },
  {
    id: DEMO_ACTION_IDS.simulateAiRecording,
    label: "Simulate AI recording",
    owner: "health",
    async run() {
      // The affected phone shows a simulated recording (only if that user consented to recording).
      const alert = await requireAlert();
      await broadcast(alert.jam_id, "ai_call_state", {
        jamId: alert.jam_id,
        alertId: alert.id,
        userId: alert.affected_user_id,
        state: "active",
        recording: true,
        timestamp: new Date().toISOString(),
      });
    },
  },
  {
    id: DEMO_ACTION_IDS.createIncidentPackage,
    label: "Create incident package",
    owner: "health",
    async run() {
      const alert = await requireAlert();
      const id = await ensureIncidentPackage(alert.id);
      if (!id) throw new Error("Couldn't create the incident package.");
    },
  },
  {
    id: DEMO_ACTION_IDS.resolveAlert,
    label: "Resolve alert",
    owner: "health",
    async run() {
      const alert = await requireAlert();
      await dispatchAlertEvent(alert, { type: "RESOLVE" });
      await broadcastScenario("safe_again");
    },
  },
];

/** Register P4's demo actions while a Jam screen is mounted. */
export function useHealthDemoActions() {
  useEffect(() => {
    const offs = ACTIONS.map((action) => demoActions.register(action));

    // Route deviation belongs to P3's map. Register our fallback only while theirs is missing.
    let offFallback: (() => void) | null = null;
    const syncFallback = () => {
      if (!offFallback && !demoActions.has(routeDeviationFallback.id)) {
        offFallback = demoActions.register(routeDeviationFallback);
      } else if (offFallback && demoActions.list().find((a) => a.id === routeDeviationFallback.id) !== routeDeviationFallback) {
        offFallback = null; // P3 replaced it.
      }
    };
    syncFallback();
    const unsubscribe = demoActions.subscribe(syncFallback);

    return () => {
      unsubscribe();
      offFallback?.();
      offs.forEach((off) => off());
    };
  }, []);
}
