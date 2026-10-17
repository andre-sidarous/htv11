import { useSyncExternalStore } from "react";
import type { AlertRow, HealthSignal, RealtimeEventMap, RealtimeEventName, RiskEvaluation, RouteStatus } from "@/lib/types";
import { realtimeService } from "@/services/realtime";
import { isTerminalState } from "./escalation";

/**
 * Per-device state for P4's safety engine: open alerts for the active Jam, this user's latest
 * simulated signal, route status, and last location. One snapshot object, replaced on change
 * (safe for useSyncExternalStore).
 */
export type LastLocation = { latitude: number; longitude: number; accuracy?: number; timestamp: string };

export type ManualCheckIn = { requestedBy: string; reason: "risk" | "group_manual"; deadlineAt?: string };

export type SafetySnapshot = {
  jamId: string | null;
  userId: string | null;
  alerts: Record<string, AlertRow>;
  lastSignal: HealthSignal | null;
  evaluation: RiskEvaluation | null;
  /** Latest RouteStatus per member (from P3's member_status). */
  routeStatus: Record<string, RouteStatus>;
  /** Latest location per member (from location_update). Latest only, never history. */
  locations: Record<string, LastLocation>;
  /** Last time this user actively answered (check-in, AI call, "I'm safe"). */
  lastResponseAt: string | null;
  /** A check-in requested without an alert (e.g. "Check in with group"). */
  manualCheckIn: ManualCheckIn | null;
  /** Alert ids with an incident package (created here or heard via incident_created). */
  incidents: Record<string, string>;
};

const initial: SafetySnapshot = {
  jamId: null,
  userId: null,
  alerts: {},
  lastSignal: null,
  evaluation: null,
  routeStatus: {},
  locations: {},
  lastResponseAt: null,
  manualCheckIn: null,
  incidents: {},
};

let snapshot = initial;
const listeners = new Set<() => void>();

export const safetyStore = {
  get: () => snapshot,
  set(update: Partial<SafetySnapshot> | ((s: SafetySnapshot) => Partial<SafetySnapshot>)) {
    const patch = typeof update === "function" ? update(snapshot) : update;
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((l) => l());
  },
  /** Merge an alert row; terminal rows are dropped from the open set. */
  putAlert(row: AlertRow) {
    safetyStore.set((s) => {
      const alerts = { ...s.alerts };
      if (row.resolved_at || isTerminalState(row.escalation_state)) delete alerts[row.id];
      else alerts[row.id] = row;
      return { alerts };
    });
  },
  replaceAlerts(rows: AlertRow[]) {
    safetyStore.set({ alerts: Object.fromEntries(rows.filter((r) => !r.resolved_at).map((r) => [r.id, r])) });
  },
  reset(jamId: string | null, userId: string | null) {
    snapshot = { ...initial, jamId, userId };
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useSafetySnapshot(): SafetySnapshot {
  return useSyncExternalStore(safetyStore.subscribe, safetyStore.get, safetyStore.get);
}

/** This user's open alert in the active Jam, if any. */
export function openAlertFor(s: SafetySnapshot, userId: string | null | undefined): AlertRow | null {
  if (!userId) return null;
  return Object.values(s.alerts).find((a) => a.affected_user_id === userId && !a.resolved_at) ?? null;
}

/** Broadcast on jam:{jamId} from anywhere (demo actions, screens). Never throws. */
export async function broadcast<E extends RealtimeEventName>(jamId: string, event: E, payload: RealtimeEventMap[E]) {
  const channel = realtimeService.join(jamId);
  try {
    await channel.send(event, payload);
  } catch (error) {
    console.warn(`[safety] broadcast ${event} failed`, error);
  } finally {
    channel.release();
  }
}
