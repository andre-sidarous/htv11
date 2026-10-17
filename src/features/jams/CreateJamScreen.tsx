import { useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, Chip, OptionCard, Screen, TextField } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import type { EmergencyPreference, TravelMode } from "@/lib/types";
import { colors, space, type } from "@/theme";
import { CAMPUS_WALK_DESTINATION, DESTINATION_PRESETS, type DestinationPreset } from "./destinations";
import { createJam } from "./jamsApi";

const TRAVEL_MODES: { value: TravelMode; label: string }[] = [
  { value: "walking", label: "Walking" },
  { value: "transit", label: "Transit" },
  { value: "mixed", label: "Mixed" },
];

const ARRIVAL_CHOICES = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1 hour", minutes: 60 },
];

const CAMPUS_WALK_CHECKIN_DELAY = 12;
const CAMPUS_WALK_GROUP_TIMEOUT = 15;
const DEFAULT_CHECKIN_DELAY = 60;
const DEFAULT_GROUP_TIMEOUT = 120;

export function CreateJamScreen() {
  const router = useRouter();
  const { onboardingDraft } = useSession();

  const [name, setName] = useState("");
  const [destination, setDestination] = useState<DestinationPreset | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("walking");
  const [arrivalMinutes, setArrivalMinutes] = useState<number | null>(30);
  const [checkinDelaySeconds, setCheckinDelaySeconds] = useState(DEFAULT_CHECKIN_DELAY);
  const [groupResponseTimeoutSeconds, setGroupResponseTimeoutSeconds] = useState(DEFAULT_GROUP_TIMEOUT);
  const [preference, setPreference] = useState<EmergencyPreference | null>(onboardingDraft.emergencyPreference);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyCampusWalkPreset() {
    setName("Campus Walk");
    setDestination(CAMPUS_WALK_DESTINATION);
    setTravelMode("walking");
    setCheckinDelaySeconds(CAMPUS_WALK_CHECKIN_DELAY);
    setGroupResponseTimeoutSeconds(CAMPUS_WALK_GROUP_TIMEOUT);
  }

  async function handleCreate() {
    if (!name.trim() || !preference) return;
    setLoading(true);
    setError(null);

    const expectedArrival =
      arrivalMinutes !== null ? new Date(Date.now() + arrivalMinutes * 60_000).toISOString() : null;

    const { jam, error } = await createJam({
      name,
      destinationName: destination?.name ?? null,
      destinationLat: destination?.latitude ?? null,
      destinationLng: destination?.longitude ?? null,
      expectedArrival,
      travelMode,
      checkinDelaySeconds,
      groupResponseTimeoutSeconds,
      emergencyPreference: preference,
      consents: onboardingDraft.consents,
    });

    setLoading(false);
    if (!jam) {
      setError(error ?? "Couldn't create the Huddle. Try again.");
      return;
    }
    router.replace(`/jam/${jam.id}/lobby`);
  }

  return (
    <Screen scroll>
      <Button label='Use the "Campus Walk" preset' variant="secondary" onPress={applyCampusWalkPreset} />

      <Card>
        <TextField label="Huddle name" value={name} onChangeText={setName} placeholder="Walk to the station" maxLength={80} editable={!loading} />
      </Card>

      <Card>
        <Text style={type.label}>Destination</Text>
        <View style={styles.chipWrap}>
          {DESTINATION_PRESETS.map((preset) => (
            <Chip
              key={preset.name}
              label={preset.name}
              selected={destination?.name === preset.name}
              onPress={() => setDestination(preset)}
            />
          ))}
        </View>
        <Text style={type.caption}>A map pick for custom destinations is on P3’s map tab.</Text>
      </Card>

      <Card>
        <Text style={type.label}>Travel mode</Text>
        <View style={styles.chipWrap}>
          {TRAVEL_MODES.map((mode) => (
            <Chip key={mode.value} label={mode.label} selected={travelMode === mode.value} onPress={() => setTravelMode(mode.value)} />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={type.label}>Expected arrival</Text>
        <View style={styles.chipWrap}>
          {ARRIVAL_CHOICES.map((choice) => (
            <Chip
              key={choice.minutes}
              label={choice.label}
              selected={arrivalMinutes === choice.minutes}
              onPress={() => setArrivalMinutes(choice.minutes)}
            />
          ))}
          <Chip label="No estimate" selected={arrivalMinutes === null} onPress={() => setArrivalMinutes(null)} />
        </View>
      </Card>

      <Card>
        <TextField
          label="Check-in delay (seconds)"
          value={String(checkinDelaySeconds)}
          onChangeText={(v) => setCheckinDelaySeconds(clampSeconds(v))}
          keyboardType="number-pad"
          hint="How long a member can go quiet before Huddle checks in."
          editable={!loading}
        />
        <TextField
          label="Group response timeout (seconds)"
          value={String(groupResponseTimeoutSeconds)}
          onChangeText={(v) => setGroupResponseTimeoutSeconds(clampSeconds(v))}
          keyboardType="number-pad"
          hint="How long the group has to respond before Huddle escalates further."
          editable={!loading}
        />
      </Card>

      <Card>
        <Text style={type.heading}>If you can’t be reached</Text>
        <View style={{ gap: space(3), marginTop: space(2) }}>
          <OptionCard
            title="AI support call"
            description="Huddle calls you with a short voice check-in before notifying anyone."
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

      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.escalation }}>
          {error}
        </Text>
      ) : null}

      <Button label="Create Huddle" onPress={handleCreate} loading={loading} disabled={!name.trim() || !preference} />
    </Screen>
  );
}

function clampSeconds(value: string): number {
  const n = Math.round(Number(value.replace(/[^0-9]/g, "")) || 0);
  return Math.min(3600, Math.max(5, n));
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
});
