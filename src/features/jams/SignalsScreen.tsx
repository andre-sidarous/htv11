import { useState } from "react";
import { Text } from "react-native";
import { Badge, Card, Screen } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import { FALLBACK_BASELINE_HEART_RATE } from "@/features/auth/onboardingDraft";
import { useJamChannel, useJamEvent } from "@/hooks/useJamChannel";
import type { HealthSignal } from "@/lib/types";
import { space, type } from "@/theme";
import { useJamMembers } from "./useJamMembers";

/** Health-sharing state, baseline, and the current simulated signal (if any). No risk logic. */
export function SignalsScreen({ jamId }: { jamId: string }) {
  const { session, onboardingDraft } = useSession();
  const { members } = useJamMembers(jamId);
  const channel = useJamChannel(jamId);
  const [signal, setSignal] = useState<HealthSignal | null>(null);

  useJamEvent(channel, "health_update", (payload) => {
    if (payload.userId === session?.user.id) setSignal(payload);
  });

  const self = members.find((m) => m.user_id === session?.user.id);
  const baseline = signal?.baselineHeartRate ?? onboardingDraft.baselineHeartRate ?? FALLBACK_BASELINE_HEART_RATE;

  return (
    <Screen scroll>
      <Text style={type.title}>Signals</Text>
      <Badge label="Simulated wearable data" tone="neutral" />

      <Card>
        <Text style={type.heading}>Health sharing</Text>
        <Text style={type.body} maxFontSizeMultiplier={1.6}>
          {self?.health_consent
            ? "On — your Jam can see a simulated heart-rate signal."
            : "Off — your Jam can't see any health signal. Turn it on in Settings."}
        </Text>
      </Card>

      <Card>
        <Text style={type.heading}>Baseline</Text>
        <Text style={type.display} accessibilityLabel={`Baseline ${baseline} beats per minute`}>
          {baseline} BPM
        </Text>
        <Text style={type.caption}>Measured during onboarding, used to judge what’s “normal” for you.</Text>
      </Card>

      <Card style={{ gap: space(1) }}>
        <Text style={type.heading}>Current signal</Text>
        {signal ? (
          <>
            <Text style={type.body}>{signal.heartRate ?? "—"} BPM</Text>
            <Text style={type.caption}>
              {[signal.activity, signal.movementState].filter(Boolean).join(" · ") || "No activity reported"}
            </Text>
          </>
        ) : (
          <Text style={type.caption}>No signal yet.</Text>
        )}
      </Card>

      <Card>
        <Text style={type.heading}>Your privacy</Text>
        <Text style={type.caption} maxFontSizeMultiplier={1.8}>
          Health signals are simulated for this prototype and only shared with your Jam while health sharing is on.
          You can turn it off anytime, and it turns off automatically when you leave the Jam.
        </Text>
      </Card>
    </Screen>
  );
}
