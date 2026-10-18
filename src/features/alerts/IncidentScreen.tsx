import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Clipboard from "expo-clipboard";
import { Stack, router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CircleCheck, Clock, Copy, ExternalLink, HeartPulse, Hourglass, IdCard, ListChecks, MapPin, Mic, Navigation, Pause, Play, Trash2, Users, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Alert, Image, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-maps";
import { JamMapView } from "@/components/map/JamMapView";
import { Badge, Button, IconBadge } from "@/components/ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { getRouteRecommendation } from "@/features/map/recommendation";
import { fonts, colors, radius, shadow, space, type, type Tone } from "@/theme";
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

  const resolved = incident.alertResolved;
  const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.headRow}>
          <Badge label={resolved ? "Resolved" : "Open alert"} tone={resolved ? "ok" : "amber"} icon={resolved ? CircleCheck : Clock} />
          <Text style={type.caption}>Created {formatAgo(incident.createdAt)}</Text>
        </View>
        <Text style={type.title}>{resolved ? `${incident.personName} is marked safe.` : `${incident.personName} may need support.`}</Text>
        {incident.role === "contact" ? (
          <Text style={type.bodyMuted}>You’re seeing this because {incident.personName} listed you as a trusted contact. You only see what they chose to share.</Text>
        ) : null}
      </View>

      {loc ? (
        <View style={[styles.card, styles.mapCard]}>
          <View pointerEvents="none" style={styles.map}>
            <JamMapView center={loc} span={0.006}>
              <Marker coordinate={{ latitude: loc.latitude, longitude: loc.longitude }} pinColor={colors.brand} title="Last known location" />
            </JamMapView>
          </View>
          <View style={styles.mapFooter}>
            <SectionTitle icon={MapPin} title="Last known location" />
            <Text style={type.body}>
              {loc.place ? `${loc.place.charAt(0).toUpperCase()}${loc.place.slice(1)}` : `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`}
            </Text>
            <Text style={type.caption}>Seen {formatAgo(loc.capturedAt)}</Text>
            <View style={styles.actions}>
              <Button
                label="Copy link"
                icon={Copy}
                variant="secondary"
                style={styles.flex}
                onPress={async () => {
                  await Clipboard.setStringAsync(mapsUrl(loc.latitude, loc.longitude));
                  Alert.alert("Copied", "A map link to the last known location is on your clipboard.");
                }}
              />
              <Button label="Open map" icon={ExternalLink} variant="secondary" style={styles.flex} onPress={() => void Linking.openURL(mapsUrl(loc.latitude, loc.longitude))} />
            </View>
          </View>
        </View>
      ) : (
        <Section icon={MapPin} title="Last known location">
          <Text style={type.caption}>Not shared.</Text>
        </Section>
      )}

      {incident.reasons?.length || incident.health ? (
        <Section icon={HeartPulse} title="Why Huddle flagged this" tone="lavender">
          {(incident.reasons ?? []).map((r) => (
            <Text key={r} style={type.body}>
              · {r}
            </Text>
          ))}
          {incident.health?.heartRate ? (
            <View style={styles.healthRow}>
              <Text style={styles.metric}>{Math.round(incident.health.heartRate)}</Text>
              <Text style={type.caption}>
                BPM{incident.health.baselineHeartRate ? ` · usual ${Math.round(incident.health.baselineHeartRate)}` : ""}
                {incident.health.activity ? ` · ${incident.health.activity.replace("_", " ")}` : ""}
              </Text>
            </View>
          ) : null}
          <Text style={type.caption}>Simulated wearable data. Not a diagnosis.</Text>
        </Section>
      ) : null}

      {incident.medicalId ? <MedicalIdSection id={incident.medicalId} /> : null}

      <Section icon={ListChecks} title="What happened">
        {incident.alertCreatedAt ? <HistoryRow label="Huddle checked in, no response" time={clock(incident.alertCreatedAt)} /> : null}
        <HistoryRow label="Incident package created" time={clock(incident.createdAt)} />
        {resolved ? <HistoryRow label="Marked safe" time="" done /> : null}
        {incident.destinationName ? (
          <View style={styles.inline}>
            <IconBadge icon={Navigation} tone="neutral" size={24} />
            <Text style={type.caption}>Heading to {incident.destinationName}</Text>
          </View>
        ) : null}
      </Section>

      {incident.recordingUrl ? (
        <RecordingCard url={incident.recordingUrl} />
      ) : incident.hasRecording && incident.role === "contact" ? null : incident.hasRecording ? (
        <Section icon={Mic} title="Support call recording">
          <Text style={type.caption}>Recording unavailable right now.</Text>
        </Section>
      ) : null}

      <Section icon={Users} title="Shared with">
        <Text style={type.body}>
          {incident.sharedWith.members.length ? incident.sharedWith.members.join(", ") : "No Huddle members"}
          {incident.sharedWith.contacts ? ` and ${incident.sharedWith.contacts} trusted contact${incident.sharedWith.contacts === 1 ? "" : "s"}` : ""}
        </Text>
      </Section>

      <Section icon={Hourglass} title="Expires" tone="neutral">
        <Text style={type.body}>{formatRemaining(incident.expiresAt)} left</Text>
        <Text style={type.caption}>Incident data is deleted after the {incident.retentionHours}-hour retention period.</Text>
      </Section>

      {incident.role !== "contact" ? (
        <Section icon={Navigation} title="Route context">
          <Text style={type.body}>{recommendation}</Text>
          <Text style={type.caption}>Move toward the highlighted public support point if you can do so safely.</Text>
        </Section>
      ) : null}

      <View style={styles.footerActions}>
        {incident.canResolve && !resolved ? <Button label="Mark resolved" icon={CircleCheck} size="lg" loading={busy === "resolve"} onPress={markResolved} /> : null}
        {incident.jamId && incident.role !== "contact" ? (
          <Button label="Back to Huddle" icon={ArrowLeft} variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        ) : null}
        {incident.canDelete ? <Button label="Delete package" icon={Trash2} variant="ghost" tint={colors.escalation} loading={busy === "delete"} onPress={confirmDelete} /> : null}
      </View>
      <Text style={[type.caption, styles.footnote]}>Huddle is not an emergency service. If someone is in immediate danger, call 911.</Text>
    </ScrollView>
  );
}

/** Like a phone's Medical ID: what a responder or contact should know. Only shown to people allowed health info. */
function MedicalIdSection({ id }: { id: NonNullable<IncidentView["medicalId"]> }) {
  const line = (label: string, items: string[]) =>
    items.length ? (
      <Text style={type.body}>
        <Text style={type.label}>{label}: </Text>
        {items.join(", ")}
      </Text>
    ) : null;
  const sex = id.sex && id.sex !== "unspecified" ? id.sex : null;
  return (
    <Section icon={IdCard} title="Medical ID" tone="neutral">
      {id.age ? <Text style={type.body}>{[`${id.age} years old`, sex].filter(Boolean).join(" · ")}</Text> : null}
      {line("Allergies", id.allergies)}
      {id.carriesEpipen ? <Badge label="Carries an EpiPen" tone="escalation" /> : null}
      {line("Conditions", id.conditions)}
      {line("Family history", id.familyHistory)}
      {id.riskPercent !== null ? (
        <Text style={type.caption}>
          Health estimate: {id.riskPercent}% chance of high blood pressure, diabetes or heart disease (model trained on CDC NHANES data). Not a diagnosis.
        </Text>
      ) : null}
      {id.medicalCardUrl ? (
        <Image source={{ uri: id.medicalCardUrl }} style={styles.medicalCard} resizeMode="contain" accessibilityLabel="Medical card photo" />
      ) : null}
    </Section>
  );
}

function Section({ icon, title, tone, children }: { icon: LucideIcon; title: string; tone?: Tone; children: ReactNode }) {
  return (
    <View style={[styles.card, tone && styles.flat, tone === "lavender" && { backgroundColor: colors.lavender }, tone === "neutral" && { backgroundColor: colors.blushSoft }]}>
      <SectionTitle icon={icon} title={title} tone={tone} />
      {children}
    </View>
  );
}

function SectionTitle({ icon, title, tone = "brand" }: { icon: LucideIcon; title: string; tone?: Tone }) {
  return (
    <View style={styles.inline}>
      <IconBadge icon={icon} tone={tone === "lavender" || tone === "neutral" ? "brand" : tone} size={28} />
      <Text style={type.heading} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

function HistoryRow({ label, time, done }: { label: string; time: string; done?: boolean }) {
  return (
    <View style={styles.historyRow}>
      <View style={[styles.historyDot, done && { backgroundColor: colors.ok }]} />
      <Text style={[type.body, styles.flex]}>{label}</Text>
      <Text style={type.caption}>{time}</Text>
    </View>
  );
}

function RecordingCard({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const seconds = Math.round(status.duration || 0);
  return (
    <Section icon={Mic} title="Support call recording">
      <Text style={type.caption}>{seconds ? `${seconds}-second recording` : "Loading recording…"} · link expires in 1 hour</Text>
      <Button
        label={status.playing ? "Pause" : "Play recording"}
        icon={status.playing ? Pause : Play}
        onPress={() => {
          if (status.playing) return player.pause();
          if (status.didJustFinish || (status.duration && status.currentTime >= status.duration)) void player.seekTo(0);
          player.play();
        }}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: space(6), backgroundColor: colors.warmWhite },
  content: { gap: space(3), padding: space(4), paddingBottom: space(12) },
  flex: { flex: 1 },
  card: { gap: space(2), padding: space(4), borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card },
  flat: { borderColor: "transparent", shadowOpacity: 0, elevation: 0 },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(2) },
  mapCard: { padding: 0, overflow: "hidden" },
  map: { height: 200 },
  mapFooter: { gap: space(1.5), padding: space(4) },
  inline: { flexDirection: "row", alignItems: "center", gap: space(2) },
  healthRow: { flexDirection: "row", alignItems: "baseline", gap: space(2) },
  metric: { fontSize: 28, fontFamily: fonts.bold, fontWeight: "700", color: colors.ink, fontVariant: ["tabular-nums"] },
  historyRow: { flexDirection: "row", alignItems: "center", gap: space(3), minHeight: 32 },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  actions: { flexDirection: "row", gap: space(2), marginTop: space(1) },
  footerActions: { gap: space(2), marginTop: space(1) },
  footnote: { textAlign: "center" },
  medicalCard: { width: "100%", height: 200, borderRadius: radius.md, backgroundColor: colors.surface },
});
