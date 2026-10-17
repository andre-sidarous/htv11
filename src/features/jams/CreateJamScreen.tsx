import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Clock } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { BrandLine, PenguinHuddle } from "@/components/brand";
import { Button, Card, Chip, Icon, OptionCard, Screen, TextField } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import { routeOrigin } from "@/features/map/useJamMapData";
import { APP_SLOGAN_CTA } from "@/lib/constants";
import type { EmergencyPreference, TravelMode } from "@/lib/types";
import { routingService } from "@/services";
import { colors, radius, space, type } from "@/theme";
import { CAMPUS_WALK_PLACE, DestinationPicker } from "./DestinationPicker";
import { createJam } from "./jamsApi";
import type { Place } from "./placeSearch";
import { arrivalTime, describeTrip, estimateTrip, type TripEstimate } from "./tripEstimate";
import { useCurrentPosition } from "./useCurrentPosition";

const TRAVEL_MODES: { value: TravelMode; label: string }[] = [
  { value: "walking", label: "Walking" },
  { value: "transit", label: "Transit" },
  { value: "mixed", label: "Mixed" },
];

const CAMPUS_WALK_CHECKIN_DELAY = 12;
const CAMPUS_WALK_GROUP_TIMEOUT = 15;
const DEFAULT_CHECKIN_DELAY = 60;
const DEFAULT_GROUP_TIMEOUT = 120;

export function CreateJamScreen() {
  const router = useRouter();
  const { onboardingDraft } = useSession();

  const [name, setName] = useState("");
  const [destination, setDestination] = useState<Place | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("walking");
  const here = useCurrentPosition();
  // Expected arrival is worked out from the real route, never asked for.
  const [trip, setTrip] = useState<{ key: string; trip: TripEstimate } | null>(null);
  const origin = destination ? routeOrigin(destination, here.position) : null;
  const tripKey = destination && origin ? `${origin.latitude},${origin.longitude}>${destination.latitude},${destination.longitude}:${travelMode}` : null;
  const currentTrip = trip && trip.key === tripKey ? trip.trip : null;
  const tripLoading = tripKey !== null && !currentTrip;

  useEffect(() => {
    if (!tripKey || !destination || !origin) return;
    let cancelled = false;
    void routingService
      .getRoute(origin, destination, travelMode)
      .catch(() => null)
      .then((route) => {
        if (!cancelled) setTrip({ key: tripKey, trip: estimateTrip(origin, destination, travelMode, route) });
      });
    return () => {
      cancelled = true;
    };
    // tripKey captures origin, destination and mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripKey]);
  const [checkinDelaySeconds, setCheckinDelaySeconds] = useState(DEFAULT_CHECKIN_DELAY);
  const [groupResponseTimeoutSeconds, setGroupResponseTimeoutSeconds] = useState(DEFAULT_GROUP_TIMEOUT);
  const [preference, setPreference] = useState<EmergencyPreference | null>(onboardingDraft.emergencyPreference);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyCampusWalkPreset() {
    setName("Campus Walk");
    setDestination(CAMPUS_WALK_PLACE);
    setTravelMode("walking");
    setCheckinDelaySeconds(CAMPUS_WALK_CHECKIN_DELAY);
    setGroupResponseTimeoutSeconds(CAMPUS_WALK_GROUP_TIMEOUT);
  }

  async function handleCreate() {
    if (!name.trim() || !preference) return;
    setLoading(true);
    setError(null);

    const expectedArrival = currentTrip ? arrivalTime(currentTrip).toISOString() : null;

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
      <View style={styles.huddleHero}>
        <PenguinHuddle height={160} />
        <BrandLine text={APP_SLOGAN_CTA} size={26} />
      </View>

      <Button label='Use the "Campus Walk" preset' variant="secondary" onPress={applyCampusWalkPreset} />

      <Card>
        <TextField label="Huddle name" value={name} onChangeText={setName} placeholder="Walk to the station" maxLength={80} editable={!loading} />
      </Card>

      <Card>
        <Text style={type.label}>Destination</Text>
        <DestinationPicker value={destination} onChange={setDestination} near={here.position} disabled={loading} />
      </Card>

      <Card>
        <Text style={type.label}>Travel mode</Text>
        <View style={styles.chipWrap}>
          {TRAVEL_MODES.map((mode) => (
            <Chip key={mode.value} label={mode.label} selected={travelMode === mode.value} onPress={() => setTravelMode(mode.value)} />
          ))}
        </View>
      </Card>

      {destination ? (
        <View style={styles.trip} accessibilityLiveRegion="polite">
          <Icon icon={Clock} size={20} color={colors.brand} />
          {tripLoading ? (
            <View style={styles.tripText}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : currentTrip ? (
            <View style={styles.tripText}>
              <Text style={type.heading}>{describeTrip(currentTrip, travelMode)}</Text>
              <Text style={type.caption}>
                Arrive around {arrivalTime(currentTrip).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                {currentTrip.source === "route" ? " · real walking route" : " · rough estimate"}
                {origin && here.position && origin !== here.position ? " · from the Campus Walk start" : ""}
              </Text>
            </View>
          ) : (
            <View style={styles.tripText}>
              <Text style={type.body}>Turn on location to estimate when you’ll arrive.</Text>
              {here.status !== "denied" ? (
                <Pressable accessibilityRole="button" onPress={() => void here.request()} hitSlop={8}>
                  <Text style={styles.link}>Use my location</Text>
                </Pressable>
              ) : (
                <Text style={type.caption}>Location is off for Huddle in Settings. The Huddle still works without an estimate.</Text>
              )}
            </View>
          )}
        </View>
      ) : null}

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
  huddleHero: { alignItems: "center", gap: space(1) },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  trip: { flexDirection: "row", alignItems: "center", gap: space(3), padding: space(4), borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tripText: { flex: 1, gap: space(1) },
  link: { ...type.label, color: colors.brand },
});
