import * as Haptics from "expo-haptics";
import { HeartPulse } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, IconBadge } from "@/components/ui";
import { colors, radius, shadow, space, type } from "@/theme";
import { restingRange, type Sex } from "./healthModel";
import { loadHealthProfile, type HealthProfileInput } from "./healthProfileApi";

/** Without a health profile, "high" means this far above their own baseline. */
const ABOVE_BASELINE = 1.4;

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const joinAnd = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** "You've listed asthma and a family history of heart disease." from their own health profile. */
export function medicalContext(p: HealthProfileInput | null): string | null {
  if (!p) return null;
  const parts = [
    ...p.conditions.map(lower),
    ...(p.familyHistory.length ? [`a family history of ${joinAnd(p.familyHistory.map(lower))}`] : []),
  ];
  return parts.length ? `You’ve listed ${joinAnd(parts)}.` : null;
}

/**
 * Heart-rate heads-up for the person themselves, shown once per spike when their heart rate goes
 * above the normal range for their age (NHANES, from their health profile) or well above their own
 * baseline. "Understood" counts as answering (resolves an open alert); "I need help" opens help.
 */
export function HeartRateHeadsUp({
  userId,
  heartRate,
  baselineHeartRate,
  blocked,
  onUnderstood,
  onNeedHelp,
}: {
  userId: string | null;
  heartRate: number | null | undefined;
  baselineHeartRate: number | null | undefined;
  /** Another sheet (the check-in) is open: wait. */
  blocked: boolean;
  onUnderstood: () => Promise<void> | void;
  onNeedHelp: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<HealthProfileInput | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void loadHealthProfile(userId).then((p) => !cancelled && setProfile(p));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const range = profile?.age ? restingRange(profile.age, (profile.sex ?? "unspecified") as Sex) : null;
  const threshold = range ? range.high : baselineHeartRate ? Math.round(baselineHeartRate * ABOVE_BASELINE) : null;
  const high = Boolean(heartRate && threshold && heartRate > threshold);

  // Once per spike: re-arm when it drops back below the threshold.
  const [wasHigh, setWasHigh] = useState(high);
  if (wasHigh !== high) {
    setWasHigh(high);
    if (!high) setDismissed(false);
  }

  const visible = high && !dismissed && !blocked;
  useEffect(() => {
    if (visible) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [visible]);

  if (!visible || !heartRate) return null;
  const context = medicalContext(profile);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => setDismissed(true)}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space(4) }]} accessibilityViewIsModal>
          <View style={styles.header}>
            <IconBadge icon={HeartPulse} tone="escalation" size={44} />
            <View style={styles.flex}>
              <Text style={type.overline}>Heart-rate heads-up</Text>
              <Text style={type.title} accessibilityRole="header">
                Your heart rate is {Math.round(heartRate)} bpm
              </Text>
            </View>
          </View>
          <Text style={type.body} maxFontSizeMultiplier={1.6}>
            {range
              ? `That’s above the normal range for your age (${range.low}–${range.high} bpm).`
              : `That’s well above your usual ${Math.round(baselineHeartRate ?? 0)} bpm.`}
            {context ? ` ${context}` : ""} Take a moment to slow down and breathe.
          </Text>
          <Text style={type.caption}>Simulated wearable data. Huddle is not a medical service.</Text>
          <Button
            label="Understood, I’m okay"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              await onUnderstood();
              setBusy(false);
              setDismissed(true);
            }}
          />
          <Button
            label="I need help"
            variant="outline"
            onPress={() => {
              setDismissed(true);
              onNeedHelp();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  sheet: {
    gap: space(3),
    paddingHorizontal: space(5),
    paddingTop: space(5),
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    backgroundColor: colors.warmWhite,
    ...shadow.raised,
  },
  header: { flexDirection: "row", alignItems: "center", gap: space(3) },
  flex: { flex: 1 },
});
