import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { ensureIncidentPackage } from "@/features/ai/incidents";
import { useJamChannel, useJamEvent } from "@/hooks/useJamChannel";
import { RISK_THRESHOLDS } from "@/lib/constants";
import type { HealthSignal, MovementState } from "@/lib/types";
import { simulatedHealth } from "@/services/health";
import { BASELINE_RANGE, scenarioFromSignal } from "@/services/health/simulated";
import { riskService } from "@/services/risk";
import { advanceDueAlert, createCheckInAlert, refreshAlert, refreshOpenAlerts, updateAlertRisk } from "./alertActions";
import { alertRepository, type MemberPolicy } from "./alertRepository";
import { openAlertFor, safetyStore } from "./safetyStore";
import { useCurrentUserId } from "./useCurrentUserId";
import { demoFlags } from "@/features/demo/demoFlags";

/** Non-affected phones wait a little past the deadline so the affected phone (if alive) ticks first. */
const MEMBER_TICK_GRACE_MS = 3_000;
const ALERT_RESYNC_MS = 20_000;
const POLICY_RELOAD_MS = 30_000;
const HEALTH_DB_INTERVAL_MS = 10_000;
/** "Sudden stop after rapid movement" looks back this far. */
const RAPID_LOOKBACK_MS = 60_000;
/** After an alert closes, don't open a new one for this long (unless the score rises). */
const REALERT_COOLDOWN_MS = 60_000;

/**
 * P4's safety engine for one Jam, mounted once per phone by CheckInOverlay (over every Jam tab).
 * Every member's phone: keeps open alerts in sync and ticks due deadlines (advance-alert).
 * The affected user's own phone additionally: streams the simulated wearable, evaluates risk,
 * opens/updates its alert, adopts demo scenarios broadcast by the presenter, opens the AI call,
 * and builds the incident package.
 */
export function useSafetyEngine(jamId: string) {
  const channel = useJamChannel(jamId);
  const me = useCurrentUserId();
  const router = useRouter();
  const [policy, setPolicy] = useState<MemberPolicy | null>(null);

  const policyRef = useRef<MemberPolicy | null>(null);
  const sentSignals = useRef(new Set<string>());
  const rapidAt = useRef(0);
  const lastMovement = useRef<MovementState | undefined>(undefined);
  const lastDbWrite = useRef(0);
  const creating = useRef(false);
  const cooldown = useRef<{ until: number; score: number }>({ until: 0, score: 0 });
  const responded = useRef(new Set<string>());
  const navigatedFor = useRef(new Set<string>());

  useEffect(() => {
    policyRef.current = policy;
  }, [policy]);

  // ----- reset + load -----

  useEffect(() => {
    safetyStore.reset(jamId, me);
  }, [jamId, me]);

  useEffect(() => {
    if (!me) return;
    let active = true;
    const load = () =>
      alertRepository
        .policy(jamId, me)
        .then((p) => active && setPolicy(p))
        .catch(() => {});
    void load();
    const timer = setInterval(load, POLICY_RELOAD_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jamId, me]);

  useEffect(() => {
    const sync = () => void refreshOpenAlerts(jamId).catch((e) => console.warn("[safety] alert sync failed", e));
    sync();
    const timer = setInterval(sync, ALERT_RESYNC_MS);
    const sub = AppState.addEventListener("change", (state) => state === "active" && sync());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [jamId]);

  // ----- risk -----

  const evaluate = () => {
    if (!me) return;
    const s = safetyStore.get();
    const consented = policyRef.current?.consents.health ?? false;
    const signal = consented ? (s.lastSignal ?? undefined) : undefined;
    const myAlert = openAlertFor(s, me);
    const checkInUnanswered = Boolean(
      myAlert &&
        !responded.current.has(myAlert.id) &&
        !["MONITORING", "CHECK_IN_SENT", "USER_RESPONDED"].includes(myAlert.escalation_state),
    );
    const now = Date.now();
    const previousMovementState: MovementState | undefined =
      signal?.movementState !== "rapid" && now - rapidAt.current < RAPID_LOOKBACK_MS ? "rapid" : lastMovement.current;

    const evaluation = riskService.evaluate({
      signal,
      previousMovementState,
      routeStatus: s.routeStatus[me],
      separatedFromGroup: false, // P3 doesn't emit separation yet; plug it in here when it does.
      checkInUnanswered,
    });
    safetyStore.set({ evaluation });

    // During Demo Control's automated story the story opens the check-ins and writes the reasons; don't race it.
    const storyDriving = demoFlags.get().storyRunning;
    if (myAlert) {
      if (!storyDriving) void updateAlertRisk(myAlert, evaluation);
      return;
    }
    const cooling = now < cooldown.current.until && evaluation.riskScore <= cooldown.current.score;
    if (evaluation.riskScore >= RISK_THRESHOLDS.checkIn && !cooling && !creating.current && !storyDriving && policyRef.current?.isMember) {
      creating.current = true;
      void createCheckInAlert({ jamId, userId: me, evaluation, requestedBy: me }).finally(() => {
        creating.current = false;
      });
    }
  };
  const evaluateRef = useRef(evaluate);
  useEffect(() => {
    evaluateRef.current = evaluate;
  });

  const onOwnSignal = (signal: HealthSignal) => {
    if (signal.movementState === "rapid") rapidAt.current = Date.now();
    safetyStore.set({ lastSignal: signal });
    evaluateRef.current();
    lastMovement.current = signal.movementState;
  };

  // ----- simulated wearable (own phone, health consent only) -----

  const healthConsent = policy?.consents.health ?? false;
  useEffect(() => {
    if (!me || !healthConsent || !channel) return;
    const baseline =
      simulatedHealth.getBaseline() ??
      BASELINE_RANGE.min + Math.round(Math.random() * (BASELINE_RANGE.max - BASELINE_RANGE.min));
    return simulatedHealth.stream({
      jamId,
      userId: me,
      baselineHeartRate: baseline,
      onSignal: (signal) => {
        sentSignals.current.add(signal.timestamp);
        if (sentSignals.current.size > 50) sentSignals.current = new Set([...sentSignals.current].slice(-20));
        onOwnSignal(signal);
        void channel.send("health_update", signal).catch(() => {});
        if (Date.now() - lastDbWrite.current >= HEALTH_DB_INTERVAL_MS) {
          lastDbWrite.current = Date.now();
          void alertRepository.saveHealthSignal(signal);
        }
      },
    });
  }, [jamId, me, healthConsent, channel]);

  // ----- realtime -----

  useJamEvent(channel, "health_update", (signal) => {
    // A demo action on another phone changed this user's simulated wearable: adopt it here so
    // this phone's risk engine, check-in, and AI call run. Our own echoes are ignored.
    if (signal.userId !== me || sentSignals.current.has(signal.timestamp)) return;
    if (!policyRef.current?.consents.health) return;
    if (signal.baselineHeartRate) simulatedHealth.setBaselineOverride(signal.baselineHeartRate);
    simulatedHealth.setScenario(me, scenarioFromSignal(signal));
  });

  useJamEvent(channel, "member_status", (status) => {
    if (!status.routeStatus) return;
    const routeStatus = status.routeStatus;
    safetyStore.set((s) => ({ routeStatus: { ...s.routeStatus, [status.userId]: routeStatus } }));
    if (status.userId === me) evaluateRef.current();
  });

  useJamEvent(channel, "location_update", (u) => {
    safetyStore.set((s) => ({
      locations: { ...s.locations, [u.userId]: { latitude: u.latitude, longitude: u.longitude, accuracy: u.accuracy, timestamp: u.timestamp } },
    }));
  });

  const onAlertEvent = (alertId: string) => void refreshAlert(alertId);
  useJamEvent(channel, "alert_created", (a) => onAlertEvent(a.id));
  useJamEvent(channel, "alert_updated", (a) => onAlertEvent(a.id));

  useJamEvent(channel, "incident_created", (e) => {
    safetyStore.set((s) => ({ incidents: { ...s.incidents, [e.alertId]: e.incidentId } }));
  });

  useJamEvent(channel, "checkin_requested", (req) => {
    if (!me || (req.targetUserId && req.targetUserId !== me)) return;
    if (req.alertId) {
      void refreshAlert(req.alertId);
      return;
    }
    if (req.reason === "risk") {
      // Forced check-in (demo "Send check-in" before any alert): open one with the current score.
      const evaluation = safetyStore.get().evaluation ?? { riskScore: 0, severity: "low" as const, reasons: [] };
      void createCheckInAlert({ jamId, userId: me, evaluation, requestedBy: req.requestedBy });
    } else {
      safetyStore.set({ manualCheckIn: { requestedBy: req.requestedBy, reason: req.reason, deadlineAt: req.deadlineAt } });
    }
  });

  // ----- deadlines (every phone) + reactions to this user's alert -----

  useEffect(() => {
    const timers = new Map<string, { deadline: string; timer: ReturnType<typeof setTimeout> }>();
    let myPrevAlertId: string | null = null;

    const sync = () => {
      const s = safetyStore.get();
      const alerts = Object.values(s.alerts);

      for (const [id, t] of timers) {
        const alert = s.alerts[id];
        if (!alert || alert.next_deadline_at !== t.deadline) {
          clearTimeout(t.timer);
          timers.delete(id);
        }
      }
      for (const alert of alerts) {
        if (!alert.next_deadline_at || timers.has(alert.id)) continue;
        const grace = alert.affected_user_id === me ? 0 : MEMBER_TICK_GRACE_MS;
        const delay = Math.max(0, Date.parse(alert.next_deadline_at) - Date.now()) + grace;
        const deadline = alert.next_deadline_at;
        const timer = setTimeout(() => {
          timers.delete(alert.id);
          const latest = safetyStore.get().alerts[alert.id];
          if (latest && latest.next_deadline_at === deadline) void advanceDueAlert(latest);
        }, delay);
        timers.set(alert.id, { deadline, timer });
      }

      // This user's own alert.
      const mine = openAlertFor(s, me);
      if (!mine && myPrevAlertId && me) {
        // Closed (resolved/cancelled by anyone): calm the simulated wearable, short cool-down.
        cooldown.current = { until: Date.now() + REALERT_COOLDOWN_MS, score: s.evaluation?.riskScore ?? 0 };
        simulatedHealth.setScenario(me, "safe_again");
      }
      myPrevAlertId = mine?.id ?? null;
      if (!mine) return;

      if ((mine.escalation_state === "AI_CALL_STARTING" || mine.escalation_state === "AI_CALL_ACTIVE") && !navigatedFor.current.has(mine.id)) {
        navigatedFor.current.add(mine.id);
        router.push({ pathname: "/jam/[jamId]/support-call", params: { jamId } });
      }
      if (
        (mine.escalation_state === "AI_CALL_USER_UNRESPONSIVE" || mine.escalation_state === "CONTACTS_NOTIFIED") &&
        !s.incidents[mine.id]
      ) {
        void ensureIncidentPackage(mine.id).catch((e) => console.warn("[safety] incident package failed", e));
      }
    };

    sync();
    const unsubscribe = safetyStore.subscribe(sync);
    return () => {
      unsubscribe();
      timers.forEach((t) => clearTimeout(t.timer));
    };
  }, [jamId, me, router]);

  return {
    me,
    policy,
    /** The overlay calls this when the user answers, so "no response" isn't scored for that alert. */
    markResponded(alertId: string | null) {
      if (alertId) responded.current.add(alertId);
      safetyStore.set({ lastResponseAt: new Date().toISOString() });
    },
    /** After "I'm okay" / "I'm safe": calm the wearable and pause re-alerting briefly. */
    calmDown() {
      if (!me) return;
      cooldown.current = { until: Date.now() + REALERT_COOLDOWN_MS, score: safetyStore.get().evaluation?.riskScore ?? 0 };
      // The stream re-emits (and broadcasts) immediately on a scenario change.
      simulatedHealth.setScenario(me, "safe_again");
    },
  };
}
