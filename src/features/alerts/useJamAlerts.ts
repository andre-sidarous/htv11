import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useJamChannel, useJamEvent } from "@/hooks/useJamChannel";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { AlertResponseKind, SafetyAlert } from "@/lib/types";
import { currentUserId, getIncidentIds, getMemberNames, listOpenAlerts, listResponses } from "./api";

export type JamAlertsState = {
  me: string | null;
  alerts: SafetyAlert[];
  names: Record<string, string>;
  responses: Record<string, AlertResponseKind[]>;
  incidents: Record<string, string>;
  loaded: boolean;
};

const EMPTY: JamAlertsState = { me: null, alerts: [], names: {}, responses: {}, incidents: {}, loaded: false };
/** Keep a resolved card briefly so people see "Resolved" before it disappears. */
const RESOLVED_LINGER_MS = 8_000;

async function fetchSnapshot(jamId: string): Promise<Omit<JamAlertsState, "loaded">> {
  const [me, names, alerts] = await Promise.all([currentUserId(), getMemberNames(jamId), listOpenAlerts(jamId)]);
  const ids = alerts.map((a) => a.id);
  const [rows, incidents] = await Promise.all([listResponses(ids), getIncidentIds(ids)]);
  const responses: Record<string, AlertResponseKind[]> = {};
  for (const r of rows) (responses[r.alertId] ??= []).push(r.kind);
  return { me, names, alerts, responses, incidents };
}

/**
 * Open alerts for a Jam, kept live from three sources so a reloaded or backgrounded app recovers:
 * the DB (on mount, reconnect, and foreground), Broadcast events, and postgres_changes on alerts.
 */
export function useJamAlerts(jamId: string) {
  const channel = useJamChannel(jamId);
  const [state, setState] = useState<JamAlertsState>(EMPTY);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  /** Merge a fresh DB snapshot, keeping lingering resolved cards the DB no longer returns as open. */
  const apply = useCallback((snapshot: Omit<JamAlertsState, "loaded">) => {
    const ids = snapshot.alerts.map((a) => a.id);
    setState((prev) => ({
      ...snapshot,
      loaded: true,
      alerts: [...snapshot.alerts, ...prev.alerts.filter((a) => a.resolvedAt && !ids.includes(a.id))],
    }));
  }, []);

  const reload = useCallback(async () => apply(await fetchSnapshot(jamId)), [apply, jamId]);

  const upsert = useCallback(
    (alert: SafetyAlert) => {
      if (alert.jamId !== jamId) return;
      setState((prev) => {
        const others = prev.alerts.filter((a) => a.id !== alert.id);
        return { ...prev, alerts: [alert, ...others] };
      });
      if (alert.resolvedAt && !timers.current.has(alert.id)) {
        timers.current.set(
          alert.id,
          setTimeout(() => {
            timers.current.delete(alert.id);
            setState((prev) => ({ ...prev, alerts: prev.alerts.filter((a) => a.id !== alert.id) }));
          }, RESOLVED_LINGER_MS),
        );
      }
    },
    [jamId],
  );

  const addResponse = useCallback((alertId: string, kind: AlertResponseKind) => {
    setState((prev) => ({ ...prev, responses: { ...prev.responses, [alertId]: [...(prev.responses[alertId] ?? []), kind] } }));
  }, []);

  // Initial load, plus whenever the app comes back to the foreground.
  useEffect(() => {
    let cancelled = false;
    const load = () => fetchSnapshot(jamId).then((snapshot) => !cancelled && apply(snapshot));
    void load();
    const sub = AppState.addEventListener("change", (s) => s === "active" && void load());
    const pending = timers.current;
    return () => {
      cancelled = true;
      sub.remove();
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, [apply, jamId]);

  // DB changes (e.g. advance-alert moved the state server-side without a broadcast).
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const ch = supabase
      .channel(`alerts-db:${jamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts", filter: `jam_id=eq.${jamId}` }, () => void reload())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alert_responses" }, () => void reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [jamId, reload]);

  useJamEvent(channel, "alert_created", upsert);
  useJamEvent(channel, "alert_updated", upsert);
  useJamEvent(channel, "incident_created", (e) =>
    setState((prev) => ({ ...prev, incidents: { ...prev.incidents, [e.alertId]: e.incidentId } })),
  );
  useJamEvent(channel, "demo_reset", () => setState((prev) => ({ ...EMPTY, me: prev.me, names: prev.names, loaded: true })));

  /** Broadcast our own change so every phone updates immediately. */
  const broadcast = useCallback(
    async (alert: SafetyAlert) => {
      upsert(alert);
      try {
        await channel?.send("alert_updated", alert);
      } catch {
        // postgres_changes + reload still deliver it.
      }
    },
    [channel, upsert],
  );

  return { ...state, reload, broadcast, addResponse };
}
