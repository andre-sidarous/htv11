import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CheckInResponse } from "@/lib/types";
import { colors, radius, shadow, space, TAP_TARGET, type } from "@/theme";
import { createCheckInAlert, dispatchAlertEvent } from "./alertActions";
import { alertRepository } from "./alertRepository";
import { openAlertFor, safetyStore, useSafetySnapshot } from "./safetyStore";
import { SafetyControls } from "./SafetyControls";
import { useHealthDemoActions } from "./useHealthDemoActions";
import { useSafetyEngine } from "./useSafetyEngine";

const RESPONSES: { value: CheckInResponse; label: string }[] = [
  { value: "im_okay", label: "I'm okay" },
  { value: "changed_destination", label: "I changed my destination" },
  { value: "im_lost", label: "I'm lost" },
  { value: "need_help", label: "I need help" },
  { value: "cannot_respond", label: "I cannot respond" },
];

/**
 * Seconds until an ISO deadline (re-rendering every second), plus the fraction of the window
 * left (1 → 0) for a progress bar. The window starts when this deadline first appears.
 */
function useCountdown(deadlineAt: string | null | undefined): { secondsLeft: number | null; progress: number | null } {
  const [now, setNow] = useState(() => Date.now());
  const [opened, setOpened] = useState<{ key: string; at: number } | null>(null);
  if (deadlineAt && opened?.key !== deadlineAt) setOpened({ key: deadlineAt, at: now });
  useEffect(() => {
    if (!deadlineAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [deadlineAt]);
  if (!deadlineAt) return { secondsLeft: null, progress: null };
  const end = Date.parse(deadlineAt);
  const secondsLeft = Math.max(0, Math.ceil((end - now) / 1000));
  const total = opened?.key === deadlineAt ? end - opened.at : 0;
  return { secondsLeft, progress: total > 0 ? Math.min(1, Math.max(0, (end - now) / total)) : null };
}

/**
 * OWNER: P4. The "Are you okay?" check-in, rendered for the current user over every
 * active-Jam tab via <JamOverlayHost />. Also hosts P4's safety engine and demo actions.
 */
export function CheckInOverlay({ jamId }: { jamId: string }) {
  const engine = useSafetyEngine(jamId);
  useHealthDemoActions();
  const snapshot = useSafetySnapshot();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const myAlert = openAlertFor(snapshot, engine.me);
  const checkInOpen = myAlert?.escalation_state === "CHECK_IN_SENT" || (!myAlert && snapshot.manualCheckIn !== null);
  const deadlineAt = myAlert?.escalation_state === "CHECK_IN_SENT" ? myAlert.next_deadline_at : snapshot.manualCheckIn?.deadlineAt;
  const { secondsLeft, progress } = useCountdown(deadlineAt);
  const reasons = (Array.isArray(myAlert?.reasons) ? (myAlert.reasons as unknown[]) : [])
    .filter((r): r is string => typeof r === "string" && r.length > 0)
    .slice(0, 3);

  // A calm haptic each time a check-in opens.
  const hapticFor = useRef<string | null>(null);
  useEffect(() => {
    const key = checkInOpen ? (myAlert?.id ?? "manual") : null;
    if (key && hapticFor.current !== key) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    hapticFor.current = key;
  }, [checkInOpen, myAlert?.id]);

  async function respond(response: CheckInResponse) {
    if (!engine.me || busy) return;
    setBusy(true);
    try {
      let alert = myAlert;
      engine.markResponded(alert?.id ?? null);
      const okay = response === "im_okay" || response === "changed_destination";
      if (!alert) {
        // Manual group check-in with no alert: "okay" just closes; asking for help opens one.
        safetyStore.set({ manualCheckIn: null });
        if (okay) return;
        const evaluation = snapshot.evaluation ?? { riskScore: 0, severity: "low" as const, reasons: [] };
        alert = await createCheckInAlert({ jamId, userId: engine.me, evaluation, requestedBy: engine.me });
        if (!alert) return;
        engine.markResponded(alert.id);
      }
      if (okay) await alertRepository.respond(alert.id, engine.me, "safe");
      await dispatchAlertEvent(alert, { type: "CHECK_IN_RESPONSE", response });
      if (okay) engine.calmDown();
    } finally {
      setBusy(false);
    }
  }

  async function markSafe() {
    if (!myAlert || !engine.me) return;
    engine.markResponded(myAlert.id);
    await alertRepository.respond(myAlert.id, engine.me, "safe");
    await dispatchAlertEvent(myAlert, { type: "RESOLVE" });
    engine.calmDown();
  }

  async function cancel() {
    if (!myAlert || !engine.me) return;
    engine.markResponded(myAlert.id);
    await dispatchAlertEvent(myAlert, { type: "CANCEL" });
    engine.calmDown();
  }

  const showBar = Boolean(myAlert) && !checkInOpen;

  return (
    <>
      {showBar ? (
        <View pointerEvents="box-none" style={[styles.barWrap, { top: insets.top + space(2) }]}>
          <View style={styles.bar}>
            <SafetyControls alert={myAlert} onSafe={markSafe} onCancel={cancel} />
          </View>
        </View>
      ) : null}

      <Modal visible={checkInOpen} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space(5) }]}>
            <Text style={type.title}>Are you okay?</Text>
            <Text style={[type.body, styles.muted]}>
              {myAlert ? "Jam noticed a combination of changes and is checking in." : "Your group is checking in."}
            </Text>
            {reasons.length ? (
              <View style={styles.reasons} accessibilityLabel={`Why Jam is checking in: ${reasons.join(". ")}`}>
                {reasons.map((r) => (
                  <View key={r} style={styles.reasonRow}>
                    <View style={styles.reasonDot} />
                    <Text style={[type.body, styles.flex]}>{r.replace(/\.$/, "")}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {secondsLeft !== null ? (
              <View style={styles.countdown}>
                {progress !== null ? (
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
                  </View>
                ) : null}
                <Text style={type.caption} accessibilityLiveRegion="polite">
                  {secondsLeft > 0
                    ? `If there's no answer, your group will be notified in ${secondsLeft}s.`
                    : "Notifying your group…"}
                </Text>
              </View>
            ) : null}

            <View style={styles.options}>
              {RESPONSES.map((r, i) => (
                <Pressable
                  key={r.value}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void respond(r.value)}
                  style={({ pressed }) => [styles.option, i === 0 && styles.primary, (pressed || busy) && styles.dim]}
                >
                  <Text style={[styles.optionText, i === 0 && styles.primaryText]}>{r.label}</Text>
                </Pressable>
              ))}
            </View>

            {myAlert ? <SafetyControls alert={myAlert} onSafe={markSafe} onCancel={cancel} compact /> : null}
            <Text style={[type.caption, styles.center]}>Simulated wearable data. Jam is not a medical service.</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  barWrap: { position: "absolute", left: space(3), right: space(3) },
  bar: { padding: space(4), borderRadius: radius.card, backgroundColor: colors.amberSoft, ...shadow.card },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(29, 39, 51, 0.35)" },
  sheet: {
    gap: space(3),
    padding: space(5),
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    backgroundColor: colors.warmWhite,
  },
  muted: { color: colors.inkMuted },
  flex: { flex: 1 },
  reasons: { gap: space(2), padding: space(4), borderRadius: radius.sm, backgroundColor: colors.amberSoft },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  reasonDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  countdown: { gap: space(2) },
  track: { height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: colors.border },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.amber },
  options: { gap: space(2), marginTop: space(1) },
  option: {
    minHeight: TAP_TARGET,
    justifyContent: "center",
    paddingHorizontal: space(4),
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionText: { fontSize: 17, fontWeight: "600", color: colors.navy, textAlign: "center" },
  primary: { backgroundColor: colors.navy, borderColor: colors.navy },
  primaryText: { color: colors.warmWhite },
  dim: { opacity: 0.6 },
  center: { textAlign: "center" },
});
