import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Clipboard from "expo-clipboard";
import { Stack, router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-maps";
import { JamMapView } from "@/components/map/JamMapView";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { getRouteRecommendation } from "@/features/map/recommendation";
import { colors, radius, shadow, space, TAP_TARGET, type } from "@/theme";
import { resolveAlert } from "./api";
import { deleteIncident, getIncident, type IncidentView } from "./incidentApi";
import { formatAgo, formatRemaining, mapsUrl } from "./presentation";
import { SessionGate } from "./SessionGate";

/**
 * OWNER: P5. Incident package screen (route: /incident/[token]). `token` is the incident package id.
 * Jam members and the affected user read it through RLS; a trusted contact signed in with the email
 * the owner saved for them gets only what that contact may see (incident-access function).
 */
export function IncidentScreen({ token }: { token: string }) {
  return (
    <>
      <Stack.Screen options={{ title: "Incident package" }} />
      <SessionGate>
        <IncidentBody incidentId={token} />
      </SessionGate>
    </>
  );
}

function IncidentBody({ incidentId }: { incidentId: string }) {
  const [incident, setIncident] = useState<IncidentView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error" | "deleted">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"delete" | "resolve" | null>(null);
  const recommendation = useMemo(() => getRouteRecommendation().explanation, []);

  const load = useCallback(async () => {
    setState("loading");
    const result = await getIncident(incidentId);
    setIncident(result.incident);
    setError(result.error);
    setState(result.incident ? "ready" : result.error ? "error" : "missing");
  }, [incidentId]);

  useEffect(() => {
    let cancelled = false;
    void getIncident(incidentId).then((result) => {
      if (cancelled) return;
      setIncident(result.incident);
      setError(result.error);
      setState(result.incident ? "ready" : result.error ? "error" : "missing");
    });
    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  if (state === "loading") return <LoadingState label="Loading the incident package…" />;
  if (state === "deleted") {
    return (
      <View style={styles.center}>
        <EmptyState title="Incident deleted" description="The location, health summary, and recording were removed." />
      </View>
    );
  }
  if (state === "error") {
    return (
      <View style={styles.center}>
        <ErrorState description={error ?? "Something went wrong."} onRetry={load} />
      </View>
    );
  }
  if (!incident) {
    return (
      <View style={styles.center}>
        <EmptyState
          title="Nothing to show"
          description="This incident has expired, was deleted, or wasn't shared with you. Contacts need to sign in with the email they were added with."
        />
      </View>
    );
  }

  const loc = incident.location;

  function confirmDelete() {
    Alert.alert("Delete this incident?", "The location, health summary, and recording are removed for everyone.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy("delete");
          const message = await deleteIncident(incidentId);
          setBusy(null);
          if (message) Alert.alert("Couldn't delete", message);
          else setState("deleted");
        },
      },
    ]);
  }

  async function markResolved() {
    setBusy("resolve");
    const { error: e } = await resolveAlert(incident!.alertId);
    setBusy(null);
    if (e) return Alert.alert("Couldn't resolve", e);
    setIncident({ ...incident!, alertResolved: true });
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={type.caption}>Incident package created {formatAgo(incident.createdAt)}</Text>
        <Text style={type.title}>{incident.alertResolved ? `${incident.personName} is marked safe.` : `${incident.personName} may need support.`}</Text>
        {incident.role === "contact" ? (
          <Text style={type.body}>You’re seeing this because {incident.personName} listed you as a trusted contact.</Text>
        ) : null}
      </View>

      {loc ? (
        <View style={[styles.card, styles.mapCard]}>
          <View pointerEvents="none" style={styles.map}>
            <JamMapView center={loc} span={0.006}>
              <Marker coordinate={{ latitude: loc.latitude, longitude: loc.longitude }} pinColor={colors.amber} title="Last known location" />
            </JamMapView>
          </View>
          <View style={styles.mapFooter}>
            <Text style={type.heading}>Last known location</Text>
            <Text style={type.body}>
              {loc.place ? `${loc.place.charAt(0).toUpperCase()}${loc.place.slice(1)}` : `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`}
            </Text>
            <Text style={type.caption}>Seen {formatAgo(loc.capturedAt)}</Text>
            <View style={styles.actions}>
              <Action
                label="Copy location"
                onPress={async () => {
                  await Clipboard.setStringAsync(mapsUrl(loc.latitude, loc.longitude));
                  Alert.alert("Copied", "A map link to the last known location is on your clipboard.");
                }}
              />
              <Action label="Open map" onPress={() => void Linking.openURL(mapsUrl(loc.latitude, loc.longitude))} />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={type.heading}>Last known location</Text>
          <Text style={type.caption}>Not shared.</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={type.heading}>Last response</Text>
        <Text style={type.body}>No response since {formatAgo(incident.alertCreatedAt)}</Text>
        {incident.destinationName ? <Text style={type.caption}>Heading to {incident.destinationName}</Text> : null}
      </View>

      {incident.reasons?.length || incident.health ? (
        <View style={styles.card}>
          <Text style={type.heading}>Why Jam flagged this</Text>
          {(incident.reasons ?? []).map((r) => (
            <Text key={r} style={type.body}>
              • {r}
            </Text>
          ))}
          {incident.health?.heartRate ? (
            <Text style={type.caption}>
              Heart rate {Math.round(incident.health.heartRate)} bpm
              {incident.health.baselineHeartRate ? ` (usual ${Math.round(incident.health.baselineHeartRate)})` : ""}
              {incident.health.activity ? ` · ${incident.health.activity.replace("_", " ")}` : ""}
            </Text>
          ) : null}
          <Text style={type.caption}>Simulated wearable data.</Text>
        </View>
      ) : null}

      {incident.recordingUrl ? (
        <RecordingCard url={incident.recordingUrl} />
      ) : incident.hasRecording && incident.role === "contact" ? null : incident.hasRecording ? (
        <View style={styles.card}>
          <Text style={type.heading}>Support call recording</Text>
          <Text style={type.caption}>Recording unavailable right now.</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={type.heading}>Shared with</Text>
        <Text style={type.body}>
          {incident.sharedWith.members.length ? incident.sharedWith.members.join(", ") : "No Jam members"}
          {incident.sharedWith.contacts ? ` and ${incident.sharedWith.contacts} trusted contact${incident.sharedWith.contacts === 1 ? "" : "s"}` : ""}
        </Text>
        <Text style={type.caption}>
          Incident data is scheduled for deletion after the selected retention period ({incident.retentionHours} hours, {formatRemaining(incident.expiresAt)} left).
        </Text>
      </View>

      {incident.role !== "contact" ? (
        <View style={styles.card}>
          <Text style={type.heading}>Route context</Text>
          <Text style={type.body}>{recommendation}</Text>
          <Text style={type.caption}>Move toward the highlighted public support point if you can do so safely.</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {incident.canResolve && !incident.alertResolved ? (
          <Action label="Mark resolved" primary busy={busy === "resolve"} onPress={markResolved} />
        ) : null}
        {incident.jamId && incident.role !== "contact" ? (
          <Action label="Back to Jam" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        ) : null}
        {incident.canDelete ? <Action label="Delete package" busy={busy === "delete"} onPress={confirmDelete} /> : null}
      </View>
      <Text style={[type.caption, styles.footnote]}>Jam is not an emergency service. If someone is in immediate danger, call 911.</Text>
    </ScrollView>
  );
}

function RecordingCard({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const seconds = Math.round(status.duration || 0);
  return (
    <View style={styles.card}>
      <Text style={type.heading}>Support call recording</Text>
      <Text style={type.caption}>{seconds ? `${seconds}-second recording` : "Loading recording…"} · link expires in 1 hour</Text>
      <View style={styles.actions}>
        <Action
          label={status.playing ? "Pause" : "Play recording"}
          primary
          onPress={() => {
            if (status.playing) return player.pause();
            if (status.didJustFinish || (status.duration && status.currentTime >= status.duration)) void player.seekTo(0);
            player.play();
          }}
        />
      </View>
    </View>
  );
}

function Action({ label, onPress, primary, busy }: { label: string; onPress: () => void; primary?: boolean; busy?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator color={primary ? colors.warmWhite : colors.navy} /> : <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: space(6), backgroundColor: colors.warmWhite },
  content: { gap: space(4), padding: space(4), paddingBottom: space(12) },
  card: { gap: space(2), padding: space(5), borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  mapCard: { padding: 0, overflow: "hidden" },
  map: { height: 200 },
  mapFooter: { gap: space(1), padding: space(5) },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(1) },
  action: {
    minHeight: TAP_TARGET,
    paddingHorizontal: space(5),
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionPrimary: { backgroundColor: colors.navy, borderColor: colors.navy },
  actionText: { color: colors.navy, fontSize: 15, fontWeight: "600" },
  actionTextPrimary: { color: colors.warmWhite },
  pressed: { opacity: 0.85 },
  footnote: { textAlign: "center" },
});
