import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Badge, Button, Card, Screen } from "@/components/ui";
import { restingRange, type RestingRange } from "@/features/health/healthModel";
import { loadHealthProfile } from "@/features/health/healthProfileApi";
import { healthService } from "@/services";
import { colors, space, type } from "@/theme";
import { useSession } from "./SessionProvider";

/**
 * Health baseline: a simulated wearable reading, used later as the "normal" heart rate to
 * compare against. No risk logic lives here — this screen only measures and stores a number.
 */
export function BaselineScreen() {
  const router = useRouter();
  const { onboardingDraft, setOnboardingDraft, session } = useSession();
  const [measuring, setMeasuring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bpm, setBpm] = useState<number | null>(onboardingDraft.baselineHeartRate);
  const [finishing, setFinishing] = useState(false);
  // From the health profile: start the simulated heartbeat at the most common resting rate for their age (NHANES).
  const [norm, setNorm] = useState<(RestingRange & { label: string }) | null>(null);
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    void loadHealthProfile(userId).then((hp) => {
      if (!hp?.age) return;
      const sex = hp.sex ?? "unspecified";
      const who = sex === "unspecified" ? "people" : sex === "female" ? "women" : "men";
      setNorm({ ...restingRange(hp.age, sex), label: `${who} aged ${restingRange(hp.age, sex).ageGroup}` });
    });
  }, [session?.user.id]);

  async function handleMeasure() {
    setMeasuring(true);
    setProgress(0);
    const result = await healthService.measureBaseline({ durationMs: 5_000, onProgress: setProgress });
    // Simulated wearable: the most common resting rate for their age group, with a little natural variation.
    setBpm(norm ? norm.mostCommon + Math.round((result % 5) - 2) : result);
    setMeasuring(false);
  }

  async function finish(value: number | null) {
    setFinishing(true);
    await setOnboardingDraft({ ...onboardingDraft, baselineHeartRate: value, completedAt: new Date().toISOString() });
    router.replace("/");
  }

  return (
    <Screen scroll>
      <Text style={type.title}>Stay still for a moment while Huddle establishes a demo heart-rate baseline.</Text>
      <Badge label="Simulated wearable data for prototype" tone="neutral" />

      <Card style={styles.measureCard}>
        {bpm !== null ? (
          <>
            <Text style={type.display} accessibilityLabel={`Baseline ${bpm} beats per minute`}>
              {bpm} BPM
            </Text>
            <Text style={type.caption}>Your resting baseline</Text>
            {norm ? (
              <Text style={[type.caption, styles.normNote]}>
                Normal for {norm.label}: {norm.low}–{norm.high} bpm (most common {norm.mostCommon}) · CDC NHANES
              </Text>
            ) : null}
          </>
        ) : measuring ? (
          <>
            <ActivityIndicator size="large" color={colors.navy} />
            <Text style={type.caption} accessibilityLiveRegion="polite">
              Measuring… {Math.round(progress * 100)}%
            </Text>
          </>
        ) : (
          <Button label="Measure baseline" onPress={handleMeasure} />
        )}
      </Card>

      <View style={styles.actions}>
        {bpm !== null ? (
          <Button label="Use this baseline" onPress={() => finish(bpm)} loading={finishing} />
        ) : null}
        <Button
          label="Skip for now"
          variant="ghost"
          onPress={() => finish(null)}
          loading={finishing && bpm === null}
          disabled={finishing}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  measureCard: { alignItems: "center", gap: space(2), minHeight: 160, justifyContent: "center" },
  actions: { gap: space(3) },
  normNote: { textAlign: "center" },
});
