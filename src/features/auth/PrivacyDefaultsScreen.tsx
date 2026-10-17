import { useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Button, Card, OptionCard, Screen, Toggle } from "@/components/ui";
import { CONSENT_KEYS } from "@/lib/constants";
import type { ConsentKey, Consents, EmergencyPreference } from "@/lib/types";
import { space, type } from "@/theme";
import { CONSENT_COPY } from "./ConsentScreen";
import { useSession } from "./SessionProvider";

/**
 * Lets a returning user revisit their default privacy choices (the draft set during
 * onboarding) without re-running the whole onboarding flow. These are only defaults —
 * each Jam's actual settings live on that Jam's Settings tab.
 */
export function PrivacyDefaultsScreen() {
  const router = useRouter();
  const { onboardingDraft, setOnboardingDraft } = useSession();
  const [consents, setConsents] = useState<Consents>(onboardingDraft.consents);
  const [preference, setPreference] = useState<EmergencyPreference | null>(onboardingDraft.emergencyPreference);
  const [saving, setSaving] = useState(false);

  function setConsent(key: ConsentKey, value: boolean) {
    setConsents((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    await setOnboardingDraft({ ...onboardingDraft, consents, emergencyPreference: preference });
    setSaving(false);
    router.back();
  }

  return (
    <Screen scroll>
      <Text style={type.title}>Privacy defaults</Text>
      <Text style={type.bodyMuted} maxFontSizeMultiplier={1.6}>
        These are the starting choices for every new Jam. Each Jam’s Settings tab can still override them.
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

      <Button label="Save defaults" onPress={handleSave} loading={saving} disabled={!preference} />
    </Screen>
  );
}
