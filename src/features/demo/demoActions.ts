import type { DemoAction } from "@/lib/types";

/**
 * The single demo-action registry. P3 (map) and P4 (health) register actions here;
 * P5's Demo Control panel lists and runs them. Nobody else builds demo control UIs.
 *
 * Use the agreed ids below so the panel can show which actions are missing.
 */
export const DEMO_ACTION_IDS = {
  // P5 (alerts)
  resetDemo: "reset_demo",
  sendIncidentPackage: "send_incident_package",
  resolveIncident: "resolve_incident",
  // P3 (map)
  moveAffectedUserAway: "move_affected_user_away",
  moveTowardDestination: "move_toward_destination",
  stopLocationUpdates: "stop_location_updates",
  resetLocations: "reset_locations",
  showDisruption: "show_disruption",
  showAlternativeRoute: "show_alternative_route",
  walkToQuietArea: "walk_to_quiet_area",
  walkTowardHelp: "walk_toward_help",
  // P4 (health / escalation)
  triggerRouteDeviation: "trigger_route_deviation",
  triggerHeartRateSpike: "trigger_heart_rate_spike",
  triggerRunning: "trigger_running",
  triggerSuddenStop: "trigger_sudden_stop",
  sendCheckIn: "send_checkin",
  simulateNoResponse: "simulate_no_response",
  simulateNoGroupResponse: "simulate_no_group_response",
  startAiCall: "start_ai_call",
  simulateAiResponse: "simulate_ai_response",
  simulateAiNonResponse: "simulate_ai_non_response",
  simulateAiRecording: "simulate_ai_recording",
  createIncidentPackage: "create_incident_package",
  resolveAlert: "resolve_alert",
} as const;

export type DemoActionId = (typeof DEMO_ACTION_IDS)[keyof typeof DEMO_ACTION_IDS];

type Listener = (actions: DemoAction[]) => void;

export function createDemoActionRegistry() {
  const actions = new Map<string, DemoAction>();
  const listeners = new Set<Listener>();
  let snapshot: DemoAction[] = [];

  const notify = () => {
    snapshot = [...actions.values()];
    listeners.forEach((listener) => listener(snapshot));
  };

  return {
    /** Register (or replace) an action. Returns an unregister function for effect cleanup. */
    register(action: DemoAction): () => void {
      actions.set(action.id, action);
      notify();
      return () => {
        if (actions.get(action.id) === action) {
          actions.delete(action.id);
          notify();
        }
      };
    },
    /** Stable array reference between changes (safe for useSyncExternalStore). */
    list(): DemoAction[] {
      return snapshot;
    },
    has(id: string): boolean {
      return actions.has(id);
    },
    async run(id: string): Promise<void> {
      const action = actions.get(id);
      if (!action) throw new Error(`Demo action "${id}" is not registered.`);
      await action.run();
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type DemoActionRegistry = ReturnType<typeof createDemoActionRegistry>;

export const demoActions: DemoActionRegistry = createDemoActionRegistry();
