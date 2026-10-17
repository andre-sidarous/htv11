import { Stack, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { StatusBar } from "expo-status-bar";
import { AudioLines, Ear, LifeBuoy, Mic, MicOff, Navigation, PhoneOff, Volume2, VolumeX, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/ui";
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
import { colors, radius, space, TAP_TARGET } from "@/theme";
import { buildCallContext, callRoute, type CallDestination } from "./callContext";
import { ensureIncidentPackage } from "./incidents";
import { useCallRecording } from "./useCallRecording";

/** How long Jam waits for a tap after each question: the silence budget split over the two pauses. */
const LISTEN_MS = AI_CALL_SILENCE_TIMEOUT_MS / (SUPPORT_CALL_SCRIPT.length - 1);
const THANKS = "Thank you. Your group can see that you responded.";

/** "phone" = Jam is ringing their real phone (Twilio); "calling" = the in-app spoken fallback. */
type Phase = "loading" | "idle" | "phone" | "calling" | "responded" | "unresponsive" | "done";

const CALL_STATES = ["AI_CALL_STARTING", "AI_CALL_ACTIVE"];

/**
 * Speak and resolve when finished (or after a fallback timeout if the TTS engine stays silent).
 * `muted` (speaker off) skips the audio but keeps the same pacing, so the call's timing is unchanged.
 */
function speak(text: string, muted = false): Promise<void> {
  return new Promise((resolve) => {
    const fallback = setTimeout(resolve, 2_000 + text.split(/\s+/).length * 450);
    if (muted) return;
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

  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
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
    await speak(THANKS, mutedRef.current);
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
      await speak(next.text, mutedRef.current);
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

  function toggleSpeaker() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) void Speech.stop();
  }

  /** Ending the call yourself means you're responsive, so it closes the alert like "I'm safe". */
  function confirmEndCall() {
    Alert.alert("End the support call?", "This tells Jam and your group you’re okay and closes the alert.", [
      { text: "Stay on the call", style: "cancel" },
      { text: "I’m okay, end call", onPress: () => void markSafe() },
    ]);
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

  const live = phase === "calling" || (phase === "phone" && (phoneState === "AI_CALL_STARTING" || phoneState === "AI_CALL_ACTIVE"));
  const speaking = phase === "calling" && Boolean(turn) && !listeningFor && !muted;
  const inCall = phase === "calling" || phase === "phone";

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "Support call",
          headerStyle: { backgroundColor: colors.callBg },
          headerTintColor: colors.callInk,
          headerTitleStyle: { color: colors.callInk, fontWeight: "600" },
          contentStyle: { backgroundColor: colors.callBg },
        }}
      />
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <CallHeader
          live={live}
          listening={Boolean(listeningFor)}
          status={noCall ? "No active call" : callStatus}
          elapsed={!noCall && callStartedAt ? formatTimer(now - callStartedAt) : null}
          tone={
            phase === "responded" || (phase === "phone" && phoneState === "AI_CALL_USER_RESPONDED")
              ? "ok"
              : phase === "unresponsive" || (phase === "phone" && (phoneState === "AI_CALL_USER_UNRESPONSIVE" || phoneState === "CONTACTS_NOTIFIED"))
                ? "attention"
                : "calm"
          }
        />

        {noCall ? null : <Waveform active={speaking} listening={Boolean(listeningFor)} />}

        <View style={styles.header}>
          <Text style={styles.headline} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
            {noCall ? "No active support call" : headline}
          </Text>
        </View>

        {phase === "phone" ? (
          <View style={styles.transcript}>
            <Text style={styles.line} maxFontSizeMultiplier={1.4}>
              {phoneState === "AI_CALL_USER_RESPONDED"
                ? "Stay on the call. Jam's AI is guiding you with your live location."
                : "Answer the call. Jam's AI will check you're okay and guide you step by step."}
            </Text>
            <Text style={styles.body}>
              Put it on speaker and come back to Jam, so your location keeps updating and the directions stay right.
            </Text>
            {phoneState === "AI_CALL_STARTING" || phoneState === "AI_CALL_ACTIVE" ? (
              <Pressable accessibilityRole="button" onPress={speakHereInstead} style={({ pressed }) => [styles.back, pressed && styles.dim]}>
                <Text style={styles.backText}>Didn&apos;t get a call? Talk here instead</Text>
              </Pressable>
            ) : null}
          </View>
        ) : noCall ? (
          <Text style={styles.body}>
            {alert ? STATE_COPY[alert.escalation_state] : "There's no support call for you right now."}
          </Text>
        ) : (
          <View style={styles.transcript} accessibilityLiveRegion="polite">
            <Text style={styles.line} maxFontSizeMultiplier={1.4}>
              {turn?.text ?? "Connecting…"}
            </Text>
            {turn ? (
              <View style={styles.sourceRow}>
                <Icon icon={AudioLines} size={14} color={colors.callInkMuted} />
                <Text style={styles.caption}>{turn.source === "gemini" ? "Spoken by Jam (AI)" : "Spoken by Jam"}</Text>
              </View>
            ) : null}
          </View>
        )}

        {phase === "calling" && fallbackReason ? (
          <Text style={styles.caption}>Couldn&apos;t ring your phone ({fallbackReason}), so Jam is speaking here.</Text>
        ) : null}

        {!noCall && phase !== "phone" && directions && (directions.guidance || directions.supportNote) ? (
          <View style={styles.directions} accessibilityRole="summary">
            <View style={styles.sourceRow}>
              <Icon icon={Navigation} size={14} color={colors.callAccent} strokeWidth={2.25} />
              <Text style={styles.directionsLabel}>{directions.destinationName ? `Toward ${directions.destinationName}` : "Where to go"}</Text>
            </View>
            {directions.guidance ? <Text style={styles.directionsText}>{directions.guidance}</Text> : null}
            {directions.nearestSupportPoint ? (
              <View style={styles.supportRow}>
                <Icon icon={LifeBuoy} size={18} color={colors.callAccent} />
                <Text style={[styles.body, styles.flex]}>
                  Nearest public place: <Text style={styles.bold}>{directions.nearestSupportPoint}</Text>
                </Text>
              </View>
            ) : null}
            {directions.supportNote && /few public support/i.test(directions.supportNote) ? (
              <Text style={styles.caption}>Few public support points are mapped around you.</Text>
            ) : null}
          </View>
        ) : null}

        {recording.mode !== "off" ? (
          <View style={styles.recording}>
            <View style={styles.recordingRow}>
              <View style={styles.dot} />
              <Text style={[styles.body, styles.recordingText]}>Recording enabled under your emergency preference</Text>
              <Text style={styles.recordingTimer}>{formatTimer(recording.startedAt ? now - recording.startedAt : 0)}</Text>
            </View>
            {recording.mode === "simulated" ? <Text style={styles.caption}>Simulated recording</Text> : null}
            {recording.note ? <Text style={styles.caption}>{recording.note}</Text> : null}
            <Pressable accessibilityRole="button" onPress={() => void recording.stop({ keep: true })} style={({ pressed }) => [styles.back, pressed && styles.dim]}>
              <Text style={styles.backText}>Stop recording</Text>
            </Pressable>
          </View>
        ) : null}

        {inCall ? (
          <View style={styles.controls}>
            <CallControl
              icon={muted ? VolumeX : Volume2}
              label={muted ? "Speaker off" : "Speaker"}
              hint={muted ? "Turns Jam’s voice back on" : "Mutes Jam’s voice. The words stay on screen."}
              active={!muted}
              onPress={toggleSpeaker}
              disabled={phase === "phone"}
            />
            <CallControl
              icon={recording.mode !== "off" ? Mic : MicOff}
              label={recording.mode !== "off" ? "Recording" : "Not recording"}
              hint={recording.mode !== "off" ? "Stops the recording" : "Recording only runs with your consent"}
              active={recording.mode !== "off"}
              onPress={() => void recording.stop({ keep: true })}
              disabled={recording.mode === "off"}
            />
            <CallControl icon={PhoneOff} label="End call" hint="Asks to confirm, then closes the alert" onPress={confirmEndCall} end />
          </View>
        ) : null}

        {phase === "calling" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Lets Jam and your group know you can hear the call"
            onPress={() => void onResponded(false)}
            style={({ pressed }) => [styles.hear, pressed && styles.dim]}
          >
            <Icon icon={Ear} size={26} color={colors.brandDark} strokeWidth={2} />
            <Text style={styles.hearText} maxFontSizeMultiplier={1.4}>
              I can hear you
            </Text>
          </Pressable>
        ) : null}

        {phase === "unresponsive" ? <Text style={styles.body}>Preparing an incident package for your group…</Text> : null}
        {phase === "done" && snapshot.incidents[alertId ?? ""] ? (
          <Text style={styles.body}>Incident package created. Your group has been notified.</Text>
        ) : null}

        <SafetyControls alert={alert} onSafe={() => void markSafe()} onCancel={() => void cancel()} compact dark />

        {phase === "done" || noCall ? (
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.dim]}>
            <Text style={styles.backText}>Back to Jam</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.caption, styles.center]}>Jam is an automated check-in. It is not emergency services or a medical service.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/** One round control under the transcript (speaker, mic, end call). */
function CallControl({
  icon,
  label,
  hint,
  onPress,
  active,
  disabled,
  end,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  end?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.control, (pressed || disabled) && styles.dim]}
    >
      <View style={[styles.controlCircle, active && styles.controlActive, end && styles.controlEnd]}>
        <Icon icon={icon} size={24} color={active ? colors.brandDark : colors.callInk} strokeWidth={2} />
      </View>
      <Text style={styles.controlLabel} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </Pressable>
  );
}

const BARS = [0.35, 0.6, 0.9, 0.55, 1, 0.7, 0.45, 0.8, 0.5, 0.95, 0.6, 0.4, 0.75, 0.5, 0.3];

/** Soft audio waveform: moves while Jam speaks, breathes gently while listening, rests otherwise. */
function Waveform({ active, listening }: { active: boolean; listening: boolean }) {
  const [values] = useState(() => BARS.map(() => new Animated.Value(0.3)));
  useEffect(() => {
    const loops = values.map((v, i) => {
      const peak = active ? BARS[i]! : listening ? 0.25 + BARS[i]! * 0.2 : 0.15;
      const duration = (active ? 320 : 900) + (i % 5) * 90;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: peak, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: peak * 0.35, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
    });
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, listening, values]);

  return (
    <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {values.map((v, i) => (
        <Animated.View key={i} style={[styles.bar, { transform: [{ scaleY: v }] }]} />
      ))}
    </View>
  );
}

/** Centered call identity: a softly pulsing orb while live, the AI status, and the call timer. */
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

  const dot = tone === "ok" ? colors.sage : tone === "attention" ? colors.amber : live ? colors.callAccent : colors.callInkMuted;
  return (
    <View style={styles.callHeader} accessibilityRole="header" accessibilityLabel={`Jam Support Call. ${status}${elapsed ? `, ${elapsed}` : ""}`}>
      <View style={styles.orbWrap}>
        {live ? (
          <Animated.View
            style={[
              styles.ring,
              { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }) },
              { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }] },
            ]}
          />
        ) : null}
        <View style={styles.orb}>
          <Text style={styles.orbText}>Jam</Text>
        </View>
      </View>
      <Text style={styles.callTitle}>Jam Support Call</Text>
      <View style={styles.statusRow}>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, { backgroundColor: dot }]} />
          <Text style={styles.statusText}>{status}</Text>
        </View>
        {elapsed ? <Text style={styles.elapsed}>{elapsed}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.callBg },
  flex: { flex: 1 },
  center: { textAlign: "center" },
  bold: { fontWeight: "700", color: colors.callInk },
  body: { fontSize: 16, lineHeight: 23, color: colors.callInk },
  caption: { fontSize: 13, lineHeight: 18, color: colors.callInkMuted },
  content: { gap: space(5), padding: space(5), paddingBottom: space(10) },
  callHeader: { alignItems: "center", gap: space(2), paddingTop: space(2) },
  orbWrap: { width: 96, height: 96, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: colors.callAccent },
  orb: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: colors.callSurfaceStrong, borderWidth: 1, borderColor: colors.callAccent },
  orbText: { color: colors.callInk, fontSize: 20, fontWeight: "800", letterSpacing: 0.5 },
  callTitle: { fontSize: 15, fontWeight: "600", letterSpacing: 0.4, color: colors.callInkMuted },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  statusPill: { flexDirection: "row", alignItems: "center", gap: space(1.5), paddingHorizontal: space(3), paddingVertical: space(1), borderRadius: radius.pill, backgroundColor: colors.callSurface },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: "700", color: colors.callInk },
  elapsed: { fontSize: 15, fontWeight: "600", color: colors.callInk, fontVariant: ["tabular-nums"] },
  wave: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  bar: { width: 4, height: 56, borderRadius: 2, backgroundColor: colors.callAccent },
  header: { gap: space(1), alignItems: "center" },
  headline: { fontSize: 20, fontWeight: "700", color: colors.callInk, textAlign: "center" },
  transcript: { gap: space(3), padding: space(5), borderRadius: radius.lg, backgroundColor: colors.callSurface },
  line: { fontSize: 24, lineHeight: 33, fontWeight: "600", color: colors.callInk },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
  directions: { gap: space(2), padding: space(5), borderRadius: radius.lg, backgroundColor: colors.callSurface, borderWidth: 1, borderColor: colors.callSurfaceStrong },
  directionsLabel: { fontSize: 12, fontWeight: "700", color: colors.callAccent, textTransform: "uppercase", letterSpacing: 0.8 },
  directionsText: { fontSize: 20, lineHeight: 27, fontWeight: "600", color: colors.callInk },
  supportRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  recording: { gap: space(1), padding: space(4), borderRadius: radius.md, backgroundColor: colors.callSurface, borderWidth: 1, borderColor: colors.amber },
  recordingRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  recordingText: { flex: 1, fontWeight: "600" },
  recordingTimer: { fontSize: 14, fontWeight: "700", color: colors.callInk, fontVariant: ["tabular-nums"] },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.amber },
  controls: { flexDirection: "row", justifyContent: "space-evenly" },
  control: { alignItems: "center", gap: space(2), minWidth: 84 },
  controlCircle: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: colors.callSurfaceStrong },
  controlActive: { backgroundColor: colors.callInk },
  controlEnd: { backgroundColor: colors.callSurface, borderWidth: 1.5, borderColor: colors.callAccent },
  controlLabel: { fontSize: 13, fontWeight: "600", color: colors.callInkMuted },
  hear: {
    minHeight: TAP_TARGET * 1.5,
    flexDirection: "row",
    gap: space(3),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.callAccent,
  },
  hearText: { color: colors.brandDark, fontSize: 22, fontWeight: "700" },
  back: { minHeight: TAP_TARGET, alignItems: "center", justifyContent: "center" },
  backText: { color: colors.callAccent, fontSize: 16, fontWeight: "600" },
  dim: { opacity: 0.55 },
});
