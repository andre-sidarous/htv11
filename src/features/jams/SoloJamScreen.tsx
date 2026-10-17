import { useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Button, Card, Chip, OptionCard, Screen, TextField } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import { useTrustedContacts } from "@/features/contacts/useTrustedContacts";
import type { EmergencyPreference } from "@/lib/types";
import { colors, space, type } from "@/theme";
import { DESTINATION_PRESETS, type DestinationPreset } from "./destinations";
import { createJam, startJam } from "./jamsApi";

/**
 * A Jam with just you in it. Skips the lobby (nobody to wait for) and starts right away. Pulse
 * and Lifeline run exactly as they do for a group Jam — a lone member just means the "tell the
 * group" step has no one to notify, so it falls straight through to the AI call and contacts.
 */
export function SoloJamScreen() {
  const router = useRouter();
  const { onboardingDraft } = useSession();
  const { contacts, loading: contactsLoading } = useTrustedContacts();

  const [name, setName] = useState("Solo Jam");
  const [nameEdited, setNameEdited] = useState(false);
  const [destination, setDestination] = useState<DestinationPreset | null>(null);
  const [preference, setPreference] = useState<EmergencyPreference | null>(onboardingDraft.emergencyPreference);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Suggests a name from the destination, unless the person already typed their own. */
  function handleSelectDestination(preset: DestinationPreset | null) {
    setDestination(preset);
    if (!nameEdited) setName(preset ? `Solo: ${preset.name}` : "Solo Jam");
  }

  async function handleStart() {
    if (!name.trim() || !preference) return;
    setLoading(true);
    setError(null);

    const { jam, error: createError } = await createJam({
      name,
      destinationName: destination?.name ?? null,
      destinationLat: destination?.latitude ?? null,
      destinationLng: destination?.longitude ?? null,
      travelMode: "walking",
      checkinDelaySeconds: 60,
      groupResponseTimeoutSeconds: 120,
      emergencyPreference: preference,
      consents: onboardingDraft.consents,
    });
    if (!jam) {
      setLoading(false);
      setError(createError ?? "Couldn't start your Solo Jam. Try again.");
      return;
    }

    const { error: startError } = await startJam(jam.id);
    setLoading(false);
    if (startError) {
      setError(startError);
      return;
    }
    router.replace({ pathname: "/jam/[jamId]/map", params: { jamId: jam.id } });
  }

  return (
    <Screen scroll>
      <Text style={type.title}>Travelling alone?</Text>
      <Text style={type.bodyMuted} maxFontSizeMultiplier={1.6}>
        Jam watches for anything unusual while you’re on your own, and reaches out directly — no
        group needed. Starts right away.
      </Text>

      <Card>
        <TextField
          label="Name"
          value={name}
          onChangeText={(value) => {
            setNameEdited(true);
            setName(value);
          }}
          maxLength={80}
          editable={!loading}
        />
      </Card>

      <Card>
        <Text style={type.label}>Destination (optional)</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
          {DESTINATION_PRESETS.map((preset) => (
            <Chip
              key={preset.name}
              label={preset.name}
              selected={destination?.name === preset.name}
              onPress={() => handleSelectDestination(destination?.name === preset.name ? null : preset)}
              disabled={loading}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={type.heading}>If Jam notices something unusual</Text>
        <Text style={type.caption} maxFontSizeMultiplier={1.8}>
          With no group to check with first, Jam moves straight to this.
        </Text>
        <View style={{ gap: space(3), marginTop: space(2) }}>
          <OptionCard
            title="Call me"
            description="Jam places an automatic support call that checks in and guides you toward your destination."
            selected={preference === "ai_support_call"}
            onPress={() => setPreference("ai_support_call")}
          />
          <OptionCard
            title="Notify my emergency contacts"
            description="Skip the call and go straight to the trusted contacts you've added."
            selected={preference === "contact_only_alert"}
            onPress={() => setPreference("contact_only_alert")}
          />
        </View>
      </Card>

      {!contactsLoading && contacts.length === 0 ? (
        <Card tone="amber">
          <Text style={type.label}>No emergency contacts yet</Text>
          <Text style={type.caption} maxFontSizeMultiplier={1.8}>
            Travelling solo, your trusted contacts are the main safety net if you can’t be
            reached. You can add them now or later — totally optional.
          </Text>
          <Button label="Add emergency contacts" variant="secondary" onPress={() => router.push("/contacts")} disabled={loading} />
        </Card>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.escalation }}>
          {error}
        </Text>
      ) : null}

      <Button label="Start Solo Jam" onPress={handleStart} loading={loading} disabled={!name.trim() || !preference} />
    </Screen>
  );
}
