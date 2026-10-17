import { useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Badge, Button, Card, OptionCard, Screen, Toggle } from "@/components/ui";
import { CONSENT_KEYS } from "@/lib/constants";
import type { ConsentKey, Consents, EmergencyPreference } from "@/lib/types";
import { space, type } from "@/theme";
import { useSession } from "./SessionProvider";

export const CONSENT_COPY: Record<ConsentKey, { label: string; description: string }> = {
  location_consent: {
    label: "Location sharing",
    description: "Lets your Jam see where you are while the Jam is active. You can pause it at any time.",
  },
  health_consent: {
    label: "Health signals",
    description: "Shares a simulated heart-rate signal with your Jam, so they can tell if something feels off.",
  },
  ai_call_consent: {
    label: "AI support call",
    description: "If you don't respond to a check-in, Jam can call you with a short voice check-in.",
  },
  recording_consent: {
    label: "Emergency recording",
    description: "Records audio during a support call, only if things escalate. Off otherwise.",
  },
  contact_notify_consent: {
    label: "Trusted-contact notifications",
    description: "If you stop responding to your group and to Jam's support call, Jam calls and texts your trusted contacts.",
  },
};

/**
 * One-time privacy screen, shown after profile setup. Everything defaults to off; the
 * choices here become the starting point for every Jam, editable per-Jam afterwards.
 */
export function ConsentScreen() {
  const router = useRouter();
  const { onboardingDraft, setOnboardingDraft } = useSession();
  const [consents, setConsents] = useState<Consents>(onboardingDraft.consents);
  const [preference, setPreference] = useState<EmergencyPreference | null>(onboardingDraft.emergencyPreference);
  const [saving, setSaving] = useState(false);

  function setConsent(key: ConsentKey, value: boolean) {
    setConsents((prev) => ({ ...prev, [key]: value }));
  }

  async function handleContinue() {
    if (!preference) return;
    setSaving(true);
    await setOnboardingDraft({ ...onboardingDraft, consents, emergencyPreference: preference });
    setSaving(false);
    router.push("/(auth)/baseline");
  }

  return (
    <Screen scroll>
      <Text style={type.title}>Your privacy, your call.</Text>
      <Text style={type.bodyMuted} maxFontSizeMultiplier={1.6}>
        Everything below starts off. Turn on only what you want to share, and change it anytime from Settings.
      </Text>

      <Card>
        <View style={{ gap: space(4) }}>
          {CONSENT_KEYS.map((key) => (
            <Toggle
              key={key}
              label={CONSENT_COPY[key].label}
              description={CONSENT_COPY[key].description}
              value={consents[key]}
              onValueChange={(value) => setConsent(key, value)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={type.heading}>If your group can’t reach you</Text>
        <Text style={type.caption} maxFontSizeMultiplier={1.8}>
          Choose what happens next. Nothing is pre-selected — you decide. You’ll confirm this again for each Jam.
        </Text>
        <Badge label="Required" tone="amber" />
        <View style={{ gap: space(3), marginTop: space(2) }}>
          <OptionCard
            title="AI support call"
            description="Jam calls you with a short voice check-in before notifying anyone."
            selected={preference === "ai_support_call"}
            onPress={() => setPreference("ai_support_call")}
          />
          <OptionCard
            title="Notify contacts only"
            description="Skip the call and go straight to your trusted contacts."
            selected={preference === "contact_only_alert"}
            onPress={() => setPreference("contact_only_alert")}
          />
        </View>
      </Card>

      <Button label="Continue" onPress={handleContinue} disabled={!preference} loading={saving} />
    </Screen>
  );
}
