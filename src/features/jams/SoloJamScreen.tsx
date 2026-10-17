import { useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Button, Card, OptionCard, Screen, TextField } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import { useTrustedContacts } from "@/features/contacts/useTrustedContacts";
import type { EmergencyPreference } from "@/lib/types";
import { colors, space, type } from "@/theme";
import { DestinationPicker } from "./DestinationPicker";
import { createJam, startJam } from "./jamsApi";
import type { Place } from "./placeSearch";
import { useCurrentPosition } from "./useCurrentPosition";

/**
 * A Jam with just you in it. Skips the lobby (nobody to wait for) and starts right away. Pulse
 * and Lifeline run exactly as they do for a group Jam — a lone member just means the "tell the
 * group" step has no one to notify, so it falls straight through to the AI call and contacts.
 */
export function SoloJamScreen() {
  const router = useRouter();
  const { onboardingDraft } = useSession();
  const { contacts, loading: contactsLoading } = useTrustedContacts();

  const [name, setName] = useState("Solo Huddle");
  const [nameEdited, setNameEdited] = useState(false);
  const [destination, setDestination] = useState<Place | null>(null);
  const here = useCurrentPosition();
  const [preference, setPreference] = useState<EmergencyPreference | null>(onboardingDraft.emergencyPreference);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Suggests a name from the destination, unless the person already typed their own. */
  function handleSelectDestination(place: Place | null) {
    setDestination(place);
    if (!nameEdited) setName(place && place.name !== "Dropped pin" ? `Solo: ${place.name}`.slice(0, 80) : "Solo Huddle");
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
      setError(createError ?? "Couldn't start your Solo Huddle. Try again.");
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
        Huddle watches for anything unusual while you’re on your own, and reaches out directly — no
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
        <DestinationPicker value={destination} onChange={handleSelectDestination} near={here.position} disabled={loading} />
      </Card>

      <Card>
        <Text style={type.heading}>If Huddle notices something unusual</Text>
        <Text style={type.caption} maxFontSizeMultiplier={1.8}>
          With no group to check with first, Huddle moves straight to this.
        </Text>
        <View style={{ gap: space(3), marginTop: space(2) }}>
          <OptionCard
            title="Call me"
            description="Huddle places an automatic support call that checks in and guides you toward your destination."
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

      <Button label="Start Solo Huddle" onPress={handleStart} loading={loading} disabled={!name.trim() || !preference} />
    </Screen>
  );
}
