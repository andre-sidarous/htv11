import * as Haptics from "expo-haptics";
import { CircleCheck, Compass, HandHeart, Info, MessageCircleQuestionMark, Navigation, PhoneOff, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, IconBadge } from "@/components/ui";
import type { CheckInResponse } from "@/lib/types";
import { colors, radius, shadow, space, tones, type } from "@/theme";
import { createCheckInAlert, dispatchAlertEvent } from "./alertActions";
import { alertRepository } from "./alertRepository";
import { openAlertFor, safetyStore, useSafetySnapshot } from "./safetyStore";
import { SafetyControls } from "./SafetyControls";
import { useHealthDemoActions } from "./useHealthDemoActions";
import { useSafetyEngine } from "./useSafetyEngine";

/** primary: burgundy · soft: blush · help: distinct red outline · quiet: plain outline. */
type ResponseStyle = "primary" | "soft" | "help" | "quiet";

const RESPONSES: { value: CheckInResponse; label: string; icon: LucideIcon; look: ResponseStyle }[] = [
  { value: "im_okay", label: "I'm okay", icon: CircleCheck, look: "primary" },
  { value: "changed_destination", label: "I changed my destination", icon: Navigation, look: "soft" },
  { value: "im_lost", label: "I'm lost", icon: Compass, look: "soft" },
  { value: "need_help", label: "I need help", icon: HandHeart, look: "help" },
  { value: "cannot_respond", label: "I cannot respond", icon: PhoneOff, look: "quiet" },
];

const LOOK: Record<ResponseStyle, { box: object; fg: string }> = {
  primary: { box: { backgroundColor: colors.brand, borderColor: colors.brand }, fg: colors.surface },
  soft: { box: { backgroundColor: colors.blush, borderColor: colors.blush }, fg: colors.brand },
  help: { box: { backgroundColor: colors.escalationSoft, borderColor: colors.escalation }, fg: colors.escalation },
  quiet: { box: { backgroundColor: colors.surface, borderColor: colors.border }, fg: colors.ink },
};

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
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space(4) }]} accessibilityViewIsModal>
            <View style={styles.handle} />
            <View style={styles.header}>
              <IconBadge icon={MessageCircleQuestionMark} tone="brand" size={44} />
              <View style={styles.flex}>
                <Text style={type.title} accessibilityRole="header">
                  Are you okay?
                </Text>
                <Text style={[type.body, styles.muted]} maxFontSizeMultiplier={1.6}>
                  {myAlert ? "We noticed some unusual activity. Please let us know how you’re doing." : "Your group is checking in. Let them know how you’re doing."}
                </Text>
              </View>
            </View>

            {reasons.length ? (
              <View style={styles.reasons} accessibilityLabel={`Why Jam is checking in: ${reasons.join(". ")}`}>
                {reasons.map((r) => (
                  <View key={r} style={styles.reasonRow}>
                    <View style={styles.reasonDot} />
                    <Text style={[type.caption, styles.reasonText]}>{r.replace(/\.$/, "")}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {secondsLeft !== null ? (
              <View style={styles.countdown}>
                <View style={styles.countdownRow}>
                  <Text style={type.caption} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.6}>
                    {secondsLeft > 0 ? "If there’s no answer, your group is notified in" : "Notifying your group…"}
                  </Text>
                  {secondsLeft > 0 ? <Text style={styles.seconds}>{secondsLeft}s</Text> : null}
                </View>
                {progress !== null ? (
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.options}>
              {RESPONSES.map((r) => {
                const look = LOOK[r.look];
                return (
                  <Pressable
                    key={r.value}
                    accessibilityRole="button"
                    accessibilityLabel={r.label}
                    disabled={busy}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      void respond(r.value);
                    }}
                    style={({ pressed }) => [styles.option, look.box, (pressed || busy) && styles.dim]}
                  >
                    <Icon icon={r.icon} size={20} color={look.fg} strokeWidth={2} />
                    <Text style={[styles.optionText, { color: look.fg }]} maxFontSizeMultiplier={1.6}>
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {myAlert ? <SafetyControls alert={myAlert} onSafe={markSafe} onCancel={cancel} compact /> : null}
            <View style={styles.footer}>
              <Icon icon={Info} size={13} color={colors.inkFaint} />
              <Text style={[type.caption, styles.center]}>Simulated wearable data. Jam is not a medical service.</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  barWrap: { position: "absolute", left: space(3), right: space(3) },
  bar: { padding: space(4), borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.blush, ...shadow.raised },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  sheet: {
    gap: space(3),
    paddingHorizontal: space(5),
    paddingTop: space(2),
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    backgroundColor: colors.warmWhite,
    ...shadow.raised,
  },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space(1) },
  header: { flexDirection: "row", gap: space(3), alignItems: "flex-start" },
  muted: { color: colors.inkMuted },
  flex: { flex: 1, gap: space(1) },
  reasons: { gap: space(1.5), padding: space(3), borderRadius: radius.md, backgroundColor: colors.lavender },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  reasonDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tones.lavender.fg },
  reasonText: { flex: 1, color: colors.ink },
  countdown: { gap: space(2) },
  countdownRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space(2) },
  seconds: { fontSize: 20, fontWeight: "700", color: colors.brand, fontVariant: ["tabular-nums"] },
  track: { height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: colors.blush },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.brand },
  options: { gap: space(2) },
  option: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    paddingHorizontal: space(4),
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  optionText: { flex: 1, fontSize: 17, fontWeight: "600" },
  dim: { opacity: 0.6 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(1.5) },
  center: { textAlign: "center" },
});
