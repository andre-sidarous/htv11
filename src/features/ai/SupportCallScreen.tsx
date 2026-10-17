import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoadingState } from "@/components/ui/States";
import { dispatchAlertEvent, refreshAlert, refreshOpenAlerts } from "@/features/health/alertActions";
import { alertRepository, type MemberPolicy } from "@/features/health/alertRepository";
import { openAlertFor, safetyStore, useSafetySnapshot } from "@/features/health/safetyStore";
import { SafetyControls, STATE_COPY } from "@/features/health/SafetyControls";
import { useCurrentUserId } from "@/features/health/useCurrentUserId";
import { useJamChannel, useJamEvent } from "@/hooks/useJamChannel";
import { SUPPORT_CALL_SCRIPT } from "@/lib/constants";
import type { AiCallState, AiCallTurn, AlertRow } from "@/lib/types";
import { aiService } from "@/services/ai";
import { simulatedHealth } from "@/services/health";
import { colors, radius, shadow, space, TAP_TARGET, type } from "@/theme";
import { buildCallContext } from "./callContext";
import { ensureIncidentPackage } from "./incidents";
import { useCallRecording } from "./useCallRecording";

/** How long Jam waits for a tap after each question. */
const LISTEN_MS = 6_000;
const THANKS = "Thank you. Your group can see that you responded.";

type Phase = "loading" | "idle" | "calling" | "responded" | "unresponsive" | "done";

const CALL_STATES = ["AI_CALL_STARTING", "AI_CALL_ACTIVE"];

/** Speak and resolve when finished (or after a fallback timeout if the TTS engine stays silent). */
function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    const fallback = setTimeout(resolve, 2_000 + text.split(/\s+/).length * 450);
    const done = () => {
      clearTimeout(fallback);
      resolve();
    };
    Speech.speak(text, { rate: 0.95, onDone: done, onStopped: done, onError: done });
  });
}

const formatTimer = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** OWNER: P4. AI support call screen (route: /jam/[jamId]/support-call). */
export function SupportCallScreen({ jamId }: { jamId: string }) {
  const router = useRouter();
  const me = useCurrentUserId();
  const channel = useJamChannel(jamId);
  const snapshot = useSafetySnapshot();
  const [phase, setPhase] = useState<Phase>("loading");
  const [turn, setTurn] = useState<AiCallTurn | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const alert = openAlertFor(snapshot, me);
  // The alert we're calling about. Kept after it resolves (for the closing message).
  const callAlert = useRef<AlertRow | null>(null);
  const [alertId, setAlertId] = useState<string | null>(null);

  const recording = useCallRecording({ userId: me });
  const recordingRef = useRef(recording);
  const policyRef = useRef<MemberPolicy | null>(null);
  const phaseRef = useRef<Phase>("loading");
  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const wake = useRef<(() => void) | null>(null);
  const started = useRef<string | null>(null);
  const onAlertChangeRef = useRef<() => void>(() => {});
  useEffect(() => {
    recordingRef.current = recording;
  });

  // Load state (the engine under the tabs keeps it fresh; this covers opening the route directly).
  useEffect(() => {
    if (!me) return;
    let active = true;
    void Promise.all([refreshOpenAlerts(jamId).catch(() => []), alertRepository.policy(jamId, me).catch(() => null)]).then(
      ([, p]) => {
        if (!active) return;
        policyRef.current = p;
        if (phaseRef.current === "loading") setPhaseBoth("idle");
        onAlertChangeRef.current();
      },
    );
    return () => {
      active = false;
    };
  }, [jamId, me]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearInterval(timer);
      void Speech.stop();
    };
  }, []);

  const sendState = (state: AiCallState, extra: { scriptStep?: number } = {}) => {
    const a = callAlert.current;
    if (!a || !channel) return;
    // Ids and states only: no utterance text, no health data.
    void channel
      .send("ai_call_state", {
        jamId,
        alertId: a.id,
        userId: a.affected_user_id,
        state,
        recording: recordingRef.current.mode !== "off",
        timestamp: new Date().toISOString(),
        ...extra,
      })
      .catch(() => {});
  };

  /** Wait for a tap (or a state change from another phone), up to `ms`. */
  const listen = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      wake.current = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  const stillCalling = () => phaseRef.current === "calling";

  async function finishUnresponsive(alreadyAdvanced: boolean) {
    const a = callAlert.current;
    if (!a || phaseRef.current === "unresponsive" || phaseRef.current === "done") return;
    setPhaseBoth("unresponsive");
    await recordingRef.current.stop({ keep: true });
    if (!alreadyAdvanced) {
      const latest = await refreshAlert(a.id);
      if (latest?.escalation_state === "AI_CALL_STARTING") {
        const active = await dispatchAlertEvent(latest, { type: "AI_CALL_CONNECTED" });
        if (active) await dispatchAlertEvent(active, { type: "AI_CALL_NO_RESPONSE" });
      } else if (latest?.escalation_state === "AI_CALL_ACTIVE") {
        await dispatchAlertEvent(latest, { type: "AI_CALL_NO_RESPONSE" });
      }
    }
    sendState("user_unresponsive");
    await ensureIncidentPackage(a.id).catch((e) => console.warn("[support-call] incident package failed", e));
    setPhaseBoth("done");
  }

  async function onResponded(alreadyAdvanced: boolean) {
    const a = callAlert.current;
    if (!a || phaseRef.current !== "calling") return;
    setPhaseBoth("responded");
    wake.current?.();
    void Speech.stop();
    safetyStore.set({ lastResponseAt: new Date().toISOString() });
    void recordingRef.current.stop({ keep: false });
    if (!alreadyAdvanced) {
      const latest = await refreshAlert(a.id);
      if (latest?.escalation_state === "AI_CALL_STARTING") {
        const active = await dispatchAlertEvent(latest, { type: "AI_CALL_CONNECTED" });
        if (active) await dispatchAlertEvent(active, { type: "AI_CALL_RESPONSE" });
      } else if (latest?.escalation_state === "AI_CALL_ACTIVE") {
        await dispatchAlertEvent(latest, { type: "AI_CALL_RESPONSE" });
      }
    }
    sendState("user_responded");
    setTurn({ text: THANKS, source: "scripted", step: SUPPORT_CALL_SCRIPT.length });
    await speak(THANKS);
  }

  async function runCall(initial: AlertRow) {
    const userId = me;
    const p = policyRef.current;
    if (!userId || !p) return;
    let current: AlertRow = initial;
    if (current.escalation_state === "AI_CALL_STARTING") current = (await dispatchAlertEvent(current, { type: "AI_CALL_CONNECTED" })) ?? current;
    sendState("active");
    void recordingRef.current.start(initial.id, p.consents.recording);

    const s = safetyStore.get();
    const context = buildCallContext({
      displayName: await alertRepository.displayName(userId).catch(() => null),
      location: s.locations[userId] ?? null,
      routeStatus: s.routeStatus[userId],
      signal: p.consents.health ? s.lastSignal : null,
      groupResponded: Boolean(current.acknowledged_at),
    });

    for (let step = 0; step < SUPPORT_CALL_SCRIPT.length && stillCalling(); step++) {
      const next = await aiService.getSupportCallTurn(context, step);
      if (!stillCalling()) return;
      setTurn(next);
      sendState("active", { scriptStep: step });
      await speak(next.text);
      if (step < SUPPORT_CALL_SCRIPT.length - 1 && stillCalling()) await listen(LISTEN_MS);
    }
    if (stillCalling()) await finishUnresponsive(false);
  }

  /** React to this user's alert (store callback): start the call, or follow changes made elsewhere. */
  const onAlertChange = () => {
    const current = openAlertFor(safetyStore.get(), me);
    if (current && CALL_STATES.includes(current.escalation_state) && callAlert.current?.id !== current.id) {
      callAlert.current = current;
      setAlertId(current.id);
    }
    const a = callAlert.current;
    if (!a) return;

    if (phaseRef.current === "idle" && policyRef.current && started.current !== a.id && current && CALL_STATES.includes(current.escalation_state)) {
      started.current = a.id;
      setPhaseBoth("calling");
      void runCall(current);
      return;
    }

    if (phaseRef.current !== "calling" && phaseRef.current !== "responded") return;
    if (!current || current.id !== a.id) {
      // Resolved or cancelled elsewhere.
      void Speech.stop();
      wake.current?.();
      void recordingRef.current.stop({ keep: false });
      setPhaseBoth("done");
    } else if (current.escalation_state === "AI_CALL_USER_RESPONDED") {
      void onResponded(true);
    } else if (current.escalation_state === "AI_CALL_USER_UNRESPONSIVE" || current.escalation_state === "CONTACTS_NOTIFIED") {
      void Speech.stop();
      wake.current?.();
      void finishUnresponsive(true);
    }
  };
  useEffect(() => {
    onAlertChangeRef.current = onAlertChange;
  });
  useEffect(() => safetyStore.subscribe(() => onAlertChangeRef.current()), []);

  // Demo "Simulate AI recording" from the presenter's phone.
  useJamEvent(channel, "ai_call_state", (e) => {
    if (e.userId === me && e.alertId === alertId && e.recording && recording.mode === "off" && phaseRef.current === "calling") {
      recording.startSimulated(e.alertId, policyRef.current?.consents.recording ?? false);
    }
  });

  async function markSafe() {
    const a = alert;
    if (!a || !me) return;
    void Speech.stop();
    wake.current?.();
    setPhaseBoth("done");
    void recording.stop({ keep: false });
    await alertRepository.respond(a.id, me, "safe");
    await dispatchAlertEvent(a, { type: "RESOLVE" });
    sendState("ended");
    simulatedHealth.setScenario(me, "safe_again");
  }

  async function cancel() {
    const a = alert;
    if (!a) return;
    void Speech.stop();
    wake.current?.();
    setPhaseBoth("done");
    void recording.stop({ keep: false });
    await dispatchAlertEvent(a, { type: "CANCEL" });
    sendState("ended");
    if (me) simulatedHealth.setScenario(me, "safe_again");
  }

  if (phase === "loading") return <LoadingState label="Connecting the support call…" />;

  const noCall = phase === "idle" && (!alert || !CALL_STATES.includes(alert.escalation_state));
  const headline =
    phase === "calling"
      ? "AI support call active"
      : phase === "responded"
        ? "You responded"
        : phase === "unresponsive"
          ? "No response received"
          : alert
            ? STATE_COPY[alert.escalation_state]
            : "Support call ended";

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={type.title}>{noCall ? "No active support call" : headline}</Text>
          <Text style={type.caption}>Jam is an automated check-in. It is not emergency services or a medical service.</Text>
        </View>

        {noCall ? (
          <Text style={type.body}>
            {alert ? STATE_COPY[alert.escalation_state] : "There's no support call for you right now."}
          </Text>
        ) : (
          <View style={styles.transcript} accessibilityLiveRegion="polite">
            <Text style={styles.line}>{turn?.text ?? "Connecting…"}</Text>
            {turn ? <Text style={type.caption}>{turn.source === "gemini" ? "Spoken by Jam (AI)" : "Spoken by Jam"}</Text> : null}
          </View>
        )}

        {recording.mode !== "off" ? (
          <View style={styles.recording}>
            <View style={styles.recordingRow}>
              <View style={styles.dot} />
              <Text style={[type.body, styles.recordingText]}>Recording enabled under your emergency preference</Text>
            </View>
            <Text style={type.caption}>
              {recording.mode === "simulated" ? "Simulated recording · " : ""}
              {formatTimer(recording.startedAt ? now - recording.startedAt : 0)}
            </Text>
            {recording.note ? <Text style={type.caption}>{recording.note}</Text> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => void recording.stop({ keep: true })}
              style={({ pressed }) => [styles.stop, pressed && styles.dim]}
            >
              <Text style={styles.stopText}>Stop recording</Text>
            </Pressable>
          </View>
        ) : null}

        {phase === "calling" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Lets Jam and your group know you can hear the call"
            onPress={() => void onResponded(false)}
            style={({ pressed }) => [styles.hear, pressed && styles.dim]}
          >
            <Text style={styles.hearText}>I can hear you</Text>
          </Pressable>
        ) : null}

        {phase === "unresponsive" ? <Text style={type.body}>Preparing an incident package for your group…</Text> : null}
        {phase === "done" && snapshot.incidents[alertId ?? ""] ? (
          <Text style={type.body}>Incident package created. Your group has been notified.</Text>
        ) : null}

        <SafetyControls alert={alert} onSafe={() => void markSafe()} onCancel={() => void cancel()} compact />

        {phase === "done" || noCall ? (
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.dim]}>
            <Text style={styles.backText}>Back to Jam</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.warmWhite },
  content: { gap: space(5), padding: space(5), paddingBottom: space(10) },
  header: { gap: space(1) },
  transcript: { gap: space(2), padding: space(5), borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  line: { fontSize: 28, lineHeight: 36, fontWeight: "600", color: colors.navy },
  recording: { gap: space(2), padding: space(4), borderRadius: radius.card, backgroundColor: colors.amberSoft },
  recordingRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  recordingText: { flex: 1, fontWeight: "600" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.amber },
  stop: {
    minHeight: TAP_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stopText: { color: colors.navy, fontSize: 16, fontWeight: "600" },
  hear: {
    minHeight: TAP_TARGET * 1.6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
  },
  hearText: { color: colors.warmWhite, fontSize: 22, fontWeight: "700" },
  back: { minHeight: TAP_TARGET, alignItems: "center", justifyContent: "center" },
  backText: { color: colors.navySoft, fontSize: 16, fontWeight: "600" },
  dim: { opacity: 0.6 },
});
