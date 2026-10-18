import * as Haptics from "expo-haptics";
import { ArrowLeft, CircleCheck, Compass, HandHeart, Info, Navigation, Phone, PhoneCall, PhoneOff, Users, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pico } from "@/components/brand";
import { Button, Icon } from "@/components/ui";
import { DestinationPicker } from "@/features/jams/DestinationPicker";
import { memberPhoneNumbers, setMyDestination } from "@/features/jams/jamsApi";
import type { Place } from "@/features/jams/placeSearch";
import { useCurrentPosition } from "@/features/jams/useCurrentPosition";
import { mapUi } from "@/features/map/mapUiStore";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { AlertRow, CheckInResponse } from "@/lib/types";
import { fonts, colors, radius, shadow, space, tones, type } from "@/theme";
import { createCheckInAlert, dispatchAlertEvent } from "./alertActions";
import { alertRepository } from "./alertRepository";
import { openAlertFor, safetyStore, useSafetySnapshot } from "./safetyStore";
import { HeartRateHeadsUp } from "./HeartRateHeadsUp";
import { SafetyControls } from "./SafetyControls";
import { simulatedHealth } from "@/services/health";
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
  const router = useRouter();
  /** "choose" the answer; some answers need one more step first. */
  const [step, setStep] = useState<"choose" | "destination" | "help">("choose");
  const [newDestination, setNewDestination] = useState<Place | null>(null);
  const [helpNote, setHelpNote] = useState<string | null>(null);
  /** "Call someone in my group": shown after the group has been alerted. */
  const [callList, setCallList] = useState<{ userId: string; name: string; phone: string }[] | "loading" | null>(null);
  /** "I need help" from the heart-rate heads-up opens the help choices without a check-in. */
  const [helpOpen, setHelpOpen] = useState(false);
  const here = useCurrentPosition();

  const myAlert = openAlertFor(snapshot, engine.me);
  const checkInOpen = myAlert?.escalation_state === "CHECK_IN_SENT" || (!myAlert && snapshot.manualCheckIn !== null);
  // A check-in that closed (answered elsewhere, or timed out) starts over at the main choices next time.
  const [wasOpen, setWasOpen] = useState(checkInOpen);
  if (wasOpen !== checkInOpen) {
    setWasOpen(checkInOpen);
    if (!checkInOpen) {
      setStep("choose");
      setNewDestination(null);
    }
  }
  const deadlineAt = myAlert?.escalation_state === "CHECK_IN_SENT" ? myAlert.next_deadline_at : snapshot.manualCheckIn?.deadlineAt;
  const { secondsLeft, progress } = useCountdown(deadlineAt);
  const reasons = (Array.isArray(myAlert?.reasons) ? (myAlert.reasons as unknown[]) : [])
    .filter((r): r is string => typeof r === "string" && r.length > 0)
    .slice(0, 3);
  const awayFromGroup = reasons.some((r) => /route|away from|group/i.test(r));

  // A calm haptic each time a check-in opens.
  const hapticFor = useRef<string | null>(null);
  useEffect(() => {
    const key = checkInOpen ? (myAlert?.id ?? "manual") : null;
    if (key && hapticFor.current !== key) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    hapticFor.current = key;
  }, [checkInOpen, myAlert?.id]);

  /** Records the answer on the alert (so the group sees "Alex is lost", not "hasn't checked in"). */
  async function respond(response: CheckInResponse): Promise<AlertRow | null> {
    if (!engine.me || busy) return null;
    setBusy(true);
    try {
      let alert = myAlert;
      engine.markResponded(alert?.id ?? null);
      const okay = response === "im_okay" || response === "changed_destination";
      if (!alert) {
        // Manual group check-in with no alert: "okay" just closes; asking for help opens one.
        safetyStore.set({ manualCheckIn: null });
        if (okay) return null;
        const evaluation = snapshot.evaluation ?? { riskScore: 0, severity: "low" as const, reasons: [] };
        alert = await createCheckInAlert({ jamId, userId: engine.me, evaluation, requestedBy: engine.me });
        if (!alert) return null;
        engine.markResponded(alert.id);
      }
      if (okay) await alertRepository.respond(alert.id, engine.me, "safe");
      const updated = await dispatchAlertEvent(alert, { type: "CHECK_IN_RESPONSE", response });
      if (okay) engine.calmDown();
      return updated;
    } finally {
      setBusy(false);
    }
  }

  function choose(response: CheckInResponse) {
    if (response === "changed_destination") return setStep("destination");
    if (response === "need_help") return setStep("help");
    void (async () => {
      await respond(response);
      if (response === "im_lost") guideToGroup();
    })();
  }

  /** "I'm lost": the group sees where they are; they get a route back to the nearest member. */
  function guideToGroup() {
    mapUi.set({ guide: { kind: "group" } });
    router.navigate({ pathname: "/jam/[jamId]/map", params: { jamId } });
  }

  /** "I changed my destination": save it, tell the group in the chat, then answer the check-in. */
  async function shareNewDestination() {
    if (!engine.me || !newDestination) return;
    setBusy(true);
    const { error } = await setMyDestination(jamId, engine.me, newDestination);
    if (!error) {
      await getSupabaseClient()
        ?.from("chat_messages")
        .insert({ jam_id: jamId, user_id: engine.me, body: `Changed my destination to ${newDestination.name}.`.slice(0, 1000) });
    }
    setBusy(false);
    if (error) return setHelpNote("Couldn’t save your new destination. Try again.");
    await respond("changed_destination");
    setStep("choose");
    setNewDestination(null);
  }

  /** "I need help" → stay on a live call with Huddle's AI (it rings their phone and keeps guiding). */
  /** Answer "I need help" if a check-in is open; otherwise use the alert as it is (or open one). */
  async function needHelpAlert(): Promise<AlertRow | null> {
    if (myAlert && myAlert.escalation_state !== "CHECK_IN_SENT") return myAlert;
    return respond("need_help");
  }

  async function helpWithCall() {
    setHelpOpen(false);
    const updated = await needHelpAlert();
    if (!updated) return;
    const started = updated.escalation_state === "GROUP_ALERT_SENT" ? await dispatchAlertEvent(updated, { type: "START_AI_CALL" }) : null;
    setStep("choose");
    if (!started) setHelpNote("The support call is off for you in this Huddle. Your group has been alerted.");
  }

  /** "I need help" → call someone in the group (numbers are only shared while you have an open alert). */
  async function helpCallGroup() {
    setHelpOpen(false);
    setCallList("loading");
    await needHelpAlert();
    setStep("choose");
    setCallList(await memberPhoneNumbers(jamId));
  }

  async function helpAlertOnly() {
    setHelpOpen(false);
    await needHelpAlert();
    setStep("choose");
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
            {myAlert?.checkin_response === "im_lost" ? (
              <Button label="Guide me back to my group" icon={Navigation} onPress={guideToGroup} />
            ) : null}
            {helpNote ? <Text style={type.caption}>{helpNote}</Text> : null}
            <SafetyControls alert={myAlert} onSafe={markSafe} onCancel={cancel} />
          </View>
        </View>
      ) : null}

      <Modal visible={checkInOpen || helpOpen} transparent animationType="slide" onRequestClose={() => setHelpOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space(4) }]} accessibilityViewIsModal>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Pico mood="concerned" size={64} />
              <View style={styles.flex}>
                <Text style={type.title} accessibilityRole="header">
                  {awayFromGroup ? "You’re away from your group" : "Are you okay?"}
                </Text>
                <Text style={[type.body, styles.muted]} maxFontSizeMultiplier={1.6}>
                  {myAlert ? "We noticed some unusual activity. Please let us know how you’re doing." : "Your group is checking in. Let them know how you’re doing."}
                </Text>
              </View>
            </View>

            {reasons.length ? (
              <View style={styles.reasons} accessibilityLabel={`Why Huddle is checking in: ${reasons.join(". ")}`}>
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

            {step === "destination" ? (
              <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepBody} keyboardShouldPersistTaps="handled">
                <Text style={type.heading}>Where are you heading now?</Text>
                <Text style={type.caption}>Your group sees your new destination, and your route follows it.</Text>
                <DestinationPicker value={newDestination} onChange={setNewDestination} near={here.position} disabled={busy} />
                {helpNote ? <Text style={[type.caption, { color: colors.escalation }]}>{helpNote}</Text> : null}
                <Button label="Share my new destination" icon={Navigation} disabled={!newDestination} loading={busy} onPress={() => void shareNewDestination()} />
                <Button label="Back" icon={ArrowLeft} variant="ghost" onPress={() => setStep("choose")} />
              </ScrollView>
            ) : step === "help" ? (
              <View style={styles.options}>
                <Text style={type.heading}>What would help right now?</Text>
                <Text style={type.caption}>Your group is alerted with any choice.</Text>
                <HelpOption
                  icon={PhoneCall}
                  title="Stay on a call with Huddle"
                  description="Huddle’s AI calls your phone and stays on the line, guiding you, until you’re somewhere you feel okay."
                  disabled={busy}
                  onPress={() => void helpWithCall()}
                />
                <HelpOption
                  icon={Users}
                  title="Call someone in my group"
                  description="Pick a member to phone right away."
                  disabled={busy}
                  onPress={() => void helpCallGroup()}
                />
                <HelpOption icon={HandHeart} title="Just alert my group" description="They’ll see you asked for help and where you are." disabled={busy} onPress={() => void helpAlertOnly()} />
                <Button
                  label="Back"
                  icon={ArrowLeft}
                  variant="ghost"
                  onPress={() => {
                    setStep("choose");
                    setHelpOpen(false);
                  }}
                />
              </View>
            ) : (
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
                      choose(r.value);
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
            )}

            {myAlert && step === "choose" ? <SafetyControls alert={myAlert} onSafe={markSafe} onCancel={cancel} compact /> : null}
            <View style={styles.footer}>
              <Icon icon={Info} size={13} color={colors.inkFaint} />
              <Text style={[type.caption, styles.center]}>Simulated wearable data. Huddle is not a medical service.</Text>
            </View>
          </View>
        </View>
      </Modal>

      <HeartRateHeadsUp
        userId={engine.me}
        heartRate={snapshot.lastSignal?.heartRate}
        baselineHeartRate={snapshot.lastSignal?.baselineHeartRate}
        blocked={checkInOpen || helpOpen || callList !== null}
        onUnderstood={async () => {
          if (engine.me) simulatedHealth.setScenario(engine.me, "safe_again");
          if (myAlert?.escalation_state === "CHECK_IN_SENT") await respond("im_okay");
          else if (myAlert) await markSafe();
          engine.calmDown();
        }}
        onNeedHelp={() => {
          setStep("help");
          setHelpOpen(true);
        }}
      />

      <Modal visible={callList !== null} transparent animationType="slide" onRequestClose={() => setCallList(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space(4) }]} accessibilityViewIsModal>
            <View style={styles.handle} />
            <Text style={type.title} accessibilityRole="header">
              Call someone in your group
            </Text>
            <Text style={type.caption}>Your group has been alerted that you asked for help.</Text>
            {callList === "loading" ? (
              <ActivityIndicator color={colors.brand} />
            ) : callList && callList.length ? (
              callList.map((m) => (
                <Pressable
                  key={m.userId}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${m.name}`}
                  onPress={() => void Linking.openURL(`tel:${m.phone}`).catch(() => undefined)}
                  style={({ pressed }) => [styles.option, LOOK.soft.box, pressed && styles.dim]}
                >
                  <Icon icon={Phone} size={20} color={LOOK.soft.fg} strokeWidth={2} />
                  <Text style={[styles.optionText, { color: LOOK.soft.fg }]}>Call {m.name}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={type.body}>No one in your group has added a phone number to their profile yet.</Text>
            )}
            <Button label="Close" variant="ghost" onPress={() => setCallList(null)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

function HelpOption({ icon, title, description, onPress, disabled }: { icon: LucideIcon; title: string; description: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.helpOption, (pressed || disabled) && styles.dim]}
    >
      <Icon icon={icon} size={22} color={colors.escalation} strokeWidth={2} />
      <View style={styles.flex}>
        <Text style={[styles.optionText, { color: colors.ink }]}>{title}</Text>
        <Text style={type.caption}>{description}</Text>
      </View>
    </Pressable>
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
  stepScroll: { maxHeight: 520 },
  stepBody: { gap: space(3), paddingBottom: space(2) },
  helpOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    padding: space(4),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.escalationSoft,
    backgroundColor: colors.surface,
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
  seconds: { fontSize: 20, fontFamily: fonts.bold, fontWeight: "700", color: colors.brand, fontVariant: ["tabular-nums"] },
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
  optionText: { flex: 1, fontSize: 17, fontFamily: fonts.semibold, fontWeight: "600" },
  dim: { opacity: 0.6 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(1.5) },
  center: { textAlign: "center" },
});
