import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoadingState } from "@/components/ui/States";
import { dispatchAlertEvent, refreshAlert, refreshOpenAlerts } from "@/features/health/alertActions";
import { alertRepository, type MemberPolicy } from "@/features/health/alertRepository";
import { openAlertFor, safetyStore, useSafetySnapshot } from "@/features/health/safetyStore";
import { SafetyControls, STATE_COPY } from "@/features/health/SafetyControls";
import { useCurrentUserId } from "@/features/health/useCurrentUserId";
import { useJam } from "@/features/jams/useJam";
import { useJamChannel, useJamEvent } from "@/hooks/useJamChannel";
import { AI_CALL_SILENCE_TIMEOUT_MS, SUPPORT_CALL_SCRIPT } from "@/lib/constants";
import type { AiCallContext, AiCallState, AiCallTurn, AlertRow } from "@/lib/types";
import { startAiPhoneCall } from "@/lib/supabase/functions";
import { aiService } from "@/services/ai";
import { simulatedHealth } from "@/services/health";
import { routingService } from "@/services/routing";
import { colors, radius, shadow, space, TAP_TARGET, type } from "@/theme";
import { buildCallContext, callRoute, type CallDestination } from "./callContext";
import { ensureIncidentPackage } from "./incidents";
import { useCallRecording } from "./useCallRecording";

/** How long Jam waits for a tap after each question: the silence budget split over the two pauses. */
const LISTEN_MS = AI_CALL_SILENCE_TIMEOUT_MS / (SUPPORT_CALL_SCRIPT.length - 1);
const THANKS = "Thank you. Your group can see that you responded.";

/** "phone" = Jam is ringing their real phone (Twilio); "calling" = the in-app spoken fallback. */
type Phase = "loading" | "idle" | "phone" | "calling" | "responded" | "unresponsive" | "done";

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
  // The Jam's destination, for spoken directions (read when the call starts).
  const { jam } = useJam(jamId);
  const jamRef = useRef(jam);
  useEffect(() => {
    jamRef.current = jam;
  }, [jam]);
  // The alert we're calling about. Kept after it resolves (for the closing message).
  const callAlert = useRef<AlertRow | null>(null);
  const [alertId, setAlertId] = useState<string | null>(null);
  // Shown on screen while the call runs: call timer, "Listening… 4s", and the directions card.
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [listeningUntil, setListeningUntil] = useState<number | null>(null);
  /** Why the real phone call couldn't be placed (shown when we fall back to the in-app call). */
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [directions, setDirections] = useState<Pick<AiCallContext, "guidance" | "nearestSupportPoint" | "supportNote" | "destinationName"> | null>(null);

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
    const timer = setInterval(() => setNow(Date.now()), 500);
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
      setListeningUntil(Date.now() + ms);
      const done = () => {
        setListeningUntil(null);
        resolve();
      };
      const timer = setTimeout(done, ms);
      wake.current = () => {
        clearTimeout(timer);
        done();
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
    setCallStartedAt(Date.now());
    void recordingRef.current.start(initial.id, p.consents.recording);

    const s = safetyStore.get();
    const location = s.locations[userId] ?? null;
    const j = jamRef.current;
    const destination: CallDestination | null =
      j?.destination_lat != null && j.destination_lng != null
        ? { latitude: Number(j.destination_lat), longitude: Number(j.destination_lng), name: j.destination_name ?? undefined }
        : null;
    const [displayName, route] = await Promise.all([
      alertRepository.displayName(userId).catch(() => null),
      location && destination ? callRoute(routingService, location, destination, j?.travel_mode) : Promise.resolve(null),
    ]);
    const context = buildCallContext({
      displayName,
      location,
      routeStatus: s.routeStatus[userId],
      signal: p.consents.health ? s.lastSignal : null,
      groupResponded: Boolean(current.acknowledged_at),
      destination,
      route,
    });
    setDirections({
      guidance: context.guidance,
      nearestSupportPoint: context.nearestSupportPoint,
      supportNote: context.supportNote,
      destinationName: context.destinationName,
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

  /** Ring their real phone (AI talks on the call); fall back to speaking here if that isn't possible. */
  async function beginCall(initial: AlertRow) {
    setCallStartedAt(Date.now());
    const result = await startAiPhoneCall(initial.id);
    if (result.mode === "phone") {
      setPhaseBoth("phone");
      sendState("active");
      return;
    }
    setFallbackReason(result.reason);
    setPhaseBoth("calling");
    await runCall(initial);
  }

  /** "Didn't get a call?": speak here instead. */
  function speakHereInstead() {
    const a = openAlertFor(safetyStore.get(), me);
    if (!a || phaseRef.current !== "phone") return;
    setFallbackReason("You chose to continue in the app");
    setPhaseBoth("calling");
    void runCall(a);
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
      void beginCall(current);
      return;
    }

    if (phaseRef.current === "phone") {
      // The live phone call drives the alert; just follow it.
      if (!current || current.id !== a.id) setPhaseBoth("done");
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
  const phoneState = alert?.escalation_state;
  const headline =
    phase === "phone"
      ? phoneState === "AI_CALL_USER_RESPONDED"
        ? "You're talking with Jam"
        : phoneState === "AI_CALL_USER_UNRESPONSIVE" || phoneState === "CONTACTS_NOTIFIED"
          ? "Your trusted contacts were notified"
          : "Jam is calling your phone"
      : phase === "calling"
      ? "AI support call active"
      : phase === "responded"
        ? "You responded"
        : phase === "unresponsive"
          ? "No response received"
          : alert
            ? STATE_COPY[alert.escalation_state]
            : "Support call ended";

  const listeningFor = listeningUntil ? Math.max(1, Math.ceil((listeningUntil - now) / 1000)) : null;
  const callStatus =
    phase === "phone"
      ? phoneState === "AI_CALL_STARTING"
        ? "Ringing your phone"
        : phoneState === "AI_CALL_ACTIVE"
          ? "On the call"
          : phoneState === "AI_CALL_USER_RESPONDED"
            ? "You responded"
            : phoneState === "AI_CALL_USER_UNRESPONSIVE" || phoneState === "CONTACTS_NOTIFIED"
              ? "Contacts notified"
              : "Call ended"
      : phase === "calling"
      ? listeningFor
        ? `Listening… ${listeningFor}s`
        : turn
          ? "Speaking"
          : "Connecting"
      : phase === "responded"
        ? "You responded"
        : phase === "unresponsive"
          ? "No response"
          : "Call ended";

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {noCall ? null : (
          <CallHeader
            live={phase === "calling" || (phase === "phone" && (phoneState === "AI_CALL_STARTING" || phoneState === "AI_CALL_ACTIVE"))}
            listening={Boolean(listeningFor)}
            status={callStatus}
            elapsed={callStartedAt ? formatTimer(now - callStartedAt) : null}
            tone={
              phase === "responded" || (phase === "phone" && phoneState === "AI_CALL_USER_RESPONDED")
                ? "ok"
                : phase === "unresponsive" || (phase === "phone" && (phoneState === "AI_CALL_USER_UNRESPONSIVE" || phoneState === "CONTACTS_NOTIFIED"))
                  ? "attention"
                  : "calm"
            }
          />
        )}
        <View style={styles.header}>
          <Text style={type.title}>{noCall ? "No active support call" : headline}</Text>
          <Text style={type.caption}>Jam is an automated check-in. It is not emergency services or a medical service.</Text>
        </View>

        {phase === "phone" ? (
          <View style={styles.transcript}>
            <Text style={styles.line} maxFontSizeMultiplier={1.4}>
              {phoneState === "AI_CALL_USER_RESPONDED"
                ? "Stay on the call. Jam's AI is guiding you with your live location."
                : "Answer the call. Jam's AI will check you're okay and guide you step by step."}
            </Text>
            <Text style={type.body}>
              Put it on speaker and come back to Jam, so your location keeps updating and the directions stay right.
            </Text>
            {phoneState === "AI_CALL_STARTING" || phoneState === "AI_CALL_ACTIVE" ? (
              <Pressable accessibilityRole="button" onPress={speakHereInstead} style={({ pressed }) => [styles.back, pressed && styles.dim]}>
                <Text style={styles.backText}>Didn&apos;t get a call? Talk here instead</Text>
              </Pressable>
            ) : null}
          </View>
        ) : noCall ? (
          <Text style={type.body}>
            {alert ? STATE_COPY[alert.escalation_state] : "There's no support call for you right now."}
          </Text>
        ) : (
          <View style={styles.transcript} accessibilityLiveRegion="polite">
            <Text style={styles.line} maxFontSizeMultiplier={1.4}>
              {turn?.text ?? "Connecting…"}
            </Text>
            {turn ? <Text style={type.caption}>{turn.source === "gemini" ? "Spoken by Jam (AI)" : "Spoken by Jam"}</Text> : null}
          </View>
        )}

        {phase === "calling" && fallbackReason ? (
          <Text style={type.caption}>Couldn&apos;t ring your phone ({fallbackReason}), so Jam is speaking here.</Text>
        ) : null}

        {!noCall && phase !== "phone" && directions && (directions.guidance || directions.supportNote) ? (
          <View style={styles.directions} accessibilityRole="summary">
            <Text style={styles.directionsLabel}>{directions.destinationName ? `Toward ${directions.destinationName}` : "Where to go"}</Text>
            {directions.guidance ? <Text style={styles.directionsText}>{directions.guidance}</Text> : null}
            {directions.nearestSupportPoint ? (
              <View style={styles.supportRow}>
                <View style={styles.supportGlyph}>
                  <Text style={styles.supportGlyphText}>+</Text>
                </View>
                <Text style={[type.body, styles.flex]}>
                  Nearest public place: <Text style={styles.bold}>{directions.nearestSupportPoint}</Text>
                </Text>
              </View>
            ) : null}
            {directions.supportNote && /few public support/i.test(directions.supportNote) ? (
              <Text style={type.caption}>Few public support points are mapped around you.</Text>
            ) : null}
          </View>
        ) : null}

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

/** "Jam is calling" badge: a softly pulsing ring while the call is live, plus status and call timer. */
function CallHeader({
  live,
  listening,
  status,
  elapsed,
  tone,
}: {
  live: boolean;
  listening: boolean;
  status: string;
  elapsed: string | null;
  tone: "calm" | "ok" | "attention";
}) {
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!live) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: listening ? 1_100 : 1_600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [live, listening, pulse]);

  const color = tone === "ok" ? colors.ok : tone === "attention" ? colors.amber : colors.navy;
  return (
    <View style={styles.callHeader} accessibilityRole="header" accessibilityLabel={`Jam support call. ${status}${elapsed ? `, ${elapsed}` : ""}`}>
      <View style={styles.badgeWrap}>
        {live ? (
          <Animated.View
            style={[
              styles.ring,
              { borderColor: color, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }) },
              { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] },
            ]}
          />
        ) : null}
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>Jam</Text>
        </View>
      </View>
      <View style={styles.flex}>
        <Text style={type.heading}>Jam support call</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusPill, listening && styles.statusPillListening]}>
            <Text style={[styles.statusText, listening && styles.statusTextListening]}>{status}</Text>
          </View>
          {elapsed ? <Text style={styles.elapsed}>{elapsed}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.warmWhite },
  flex: { flex: 1 },
  bold: { fontWeight: "700", color: colors.navy },
  callHeader: { flexDirection: "row", alignItems: "center", gap: space(4), paddingTop: space(2) },
  badgeWrap: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 72, height: 72, borderRadius: 36, borderWidth: 3 },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.warmWhite, fontSize: 18, fontWeight: "800", letterSpacing: 0.5 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space(2), marginTop: space(1) },
  statusPill: { paddingHorizontal: space(3), paddingVertical: space(1), borderRadius: radius.pill, backgroundColor: colors.sky },
  statusPillListening: { backgroundColor: colors.amberSoft },
  statusText: { fontSize: 13, fontWeight: "700", color: colors.navy },
  statusTextListening: { color: "#8a5a00" },
  elapsed: { fontSize: 13, color: colors.inkMuted, fontVariant: ["tabular-nums"] },
  directions: { gap: space(2), padding: space(5), borderRadius: radius.card, backgroundColor: colors.sky },
  directionsLabel: { fontSize: 13, fontWeight: "700", color: colors.navySoft, textTransform: "uppercase", letterSpacing: 0.6 },
  directionsText: { fontSize: 20, lineHeight: 27, fontWeight: "600", color: colors.navy },
  supportRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  supportGlyph: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.navy },
  supportGlyphText: { color: colors.warmWhite, fontSize: 16, fontWeight: "800", lineHeight: 18 },
  content: { gap: space(5), padding: space(5), paddingBottom: space(10) },
  header: { gap: space(1) },
  transcript: { gap: space(2), padding: space(5), borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  line: { fontSize: 22, lineHeight: 30, fontWeight: "600", color: colors.navy },
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
