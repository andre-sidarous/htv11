import { Footprints, Gauge, HeartPulse, Lock, Watch, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Badge, Card, IconBadge, Screen, SectionHeader, Sparkline } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import { FALLBACK_BASELINE_HEART_RATE } from "@/features/auth/onboardingDraft";
import { alertRepository } from "@/features/health/alertRepository";
import { EscalationTimeline } from "@/features/health/EscalationTimeline";
import { openAlertFor, useSafetySnapshot } from "@/features/health/safetyStore";
import { useJamChannel, useJamEvent } from "@/hooks/useJamChannel";
import type { HealthSignal } from "@/lib/types";
import { fonts, colors, space, type, type Tone } from "@/theme";
import { useJamMembers } from "./useJamMembers";

/** ~2 minutes of history at one simulated signal every 3 s. Kept in memory only, never stored here. */
const HISTORY = 40;

const ACTIVITY_COPY: Record<NonNullable<HealthSignal["activity"]>, string> = {
  walking: "Walking",
  running: "Running",
  stationary: "Still",
  fall_simulated: "Simulated fall",
};
const MOVEMENT_COPY: Record<NonNullable<HealthSignal["movementState"]>, string> = {
  normal: "Steady movement",
  rapid: "Moving quickly",
  stopped: "Stopped",
};
const SEVERITY: Record<"low" | "moderate" | "high", { label: string; tone: Tone }> = {
  low: { label: "Monitoring", tone: "sage" },
  moderate: { label: "Check-in range", tone: "amber" },
  high: { label: "Escalation range", tone: "amber" },
};

/**
 * Pulse: this user's simulated heart rate against their baseline, movement, recent signals, the
 * explainable risk score, and where any open alert is in the escalation. Display only, no risk logic.
 */
export function SignalsScreen({ jamId }: { jamId: string }) {
  const { session, onboardingDraft } = useSession();
  const me = session?.user.id ?? null;
  const { members } = useJamMembers(jamId);
  const channel = useJamChannel(jamId);
  const snapshot = useSafetySnapshot();
  const [history, setHistory] = useState<HealthSignal[]>([]);
  const [aiCallAllowed, setAiCallAllowed] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useJamEvent(channel, "health_update", (payload) => {
    if (payload.userId === me) setHistory((h) => [...h.slice(-(HISTORY - 1)), payload]);
  });

  useEffect(() => {
    if (!me) return;
    let active = true;
    void alertRepository
      .policy(jamId, me)
      .then((p) => active && setAiCallAllowed(p.config.aiCallAllowed))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [jamId, me]);

  const alert = openAlertFor(snapshot, me);
  useEffect(() => {
    if (!alert?.next_deadline_at) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [alert?.next_deadline_at]);

  const self = members.find((m) => m.user_id === me);
  const signal = history[history.length - 1] ?? (snapshot.lastSignal?.userId === me ? snapshot.lastSignal : null);
  const baseline = signal?.baselineHeartRate ?? onboardingDraft.baselineHeartRate ?? FALLBACK_BASELINE_HEART_RATE;
  const heartRate = signal?.heartRate != null ? Math.round(signal.heartRate) : null;
  const delta = heartRate != null ? Math.round(((heartRate - baseline) / baseline) * 100) : null;
  const series = history.map((s) => s.heartRate).filter((v): v is number => typeof v === "number");
  const evaluation = snapshot.evaluation;

  return (
    <Screen scroll>
      <View style={styles.titleRow}>
        <Text style={type.title}>Health</Text>
        <Badge label="Simulated wearable data" tone="lavender" icon={Watch} />
      </View>

      {!self?.health_consent ? (
        <Card tone="amber">
          <Text style={type.label}>Health sharing is off</Text>
          <Text style={type.caption} maxFontSizeMultiplier={1.8}>
            Your Huddle can’t see any health signal and Huddle doesn’t score it. Turn it on in Settings.
          </Text>
        </Card>
      ) : null}

      <Card style={styles.hero}>
        <View style={styles.heroHead}>
          <IconBadge icon={HeartPulse} tone="brand" />
          <Text style={[type.label, styles.flex]}>Heart rate</Text>
          {delta !== null ? <Badge label={`${delta >= 0 ? "+" : ""}${delta}% vs baseline`} tone={Math.abs(delta) >= 40 ? "amber" : "neutral"} /> : null}
        </View>
        <View
          style={styles.metricRow}
          accessibilityLabel={heartRate != null ? `Heart rate ${heartRate} beats per minute. Baseline ${baseline}.` : `No signal yet. Baseline ${baseline}.`}
        >
          <Text style={type.metric}>{heartRate ?? "—"}</Text>
          <Text style={styles.unit}>BPM</Text>
          <View style={styles.flex} />
          <View style={styles.baseline}>
            <Text style={type.overline}>Baseline</Text>
            <Text style={styles.baselineValue}>{baseline} BPM</Text>
          </View>
        </View>
        {series.length > 1 ? (
          <Sparkline values={series} reference={baseline} />
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={type.caption}>{self?.health_consent ? "Waiting for the next signal…" : "No signal while sharing is off."}</Text>
          </View>
        )}
        <Text style={type.caption}>Last ~2 minutes · dashed line is your personal baseline</Text>
      </Card>

      <View style={styles.tiles}>
        <Tile icon={Footprints} tone="sage" label="Activity" value={signal?.activity ? ACTIVITY_COPY[signal.activity] : "—"} />
        <Tile icon={Gauge} tone="lavender" label="Movement" value={signal?.movementState ? MOVEMENT_COPY[signal.movementState] : "—"} />
      </View>

      <SectionHeader title="What Huddle is watching" />
      <Card>
        <View style={styles.heroHead}>
          <Text style={[type.label, styles.flex]}>Pulse score {evaluation ? evaluation.riskScore : 0}</Text>
          <Badge label={SEVERITY[evaluation?.severity ?? "low"].label} tone={SEVERITY[evaluation?.severity ?? "low"].tone} />
        </View>
        {evaluation?.reasons.length ? (
          evaluation.reasons.slice(0, 4).map((r) => (
            <Text key={r} style={type.body} maxFontSizeMultiplier={1.6}>
              · {r}
            </Text>
          ))
        ) : (
          <Text style={type.caption}>Nothing unusual. Huddle checks in only when several signals change together.</Text>
        )}
      </Card>

      <SectionHeader title="Escalation" />
      <Card>
        <EscalationTimeline
          state={alert?.escalation_state ?? null}
          aiCallAllowed={aiCallAllowed}
          startedAt={alert?.created_at}
          acknowledgedAt={alert?.acknowledged_at}
          deadlineAt={alert?.next_deadline_at}
          now={now}
        />
      </Card>

      {history.length > 0 ? (
        <>
          <SectionHeader title="Recent signals" />
          <Card padded={false}>
            {history
              .slice(-5)
              .reverse()
              .map((s, i, list) => (
                <View key={s.timestamp} style={[styles.signalRow, i < list.length - 1 && styles.signalBorder]}>
                  <Text style={[type.caption, styles.time]}>{new Date(s.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</Text>
                  <Text style={[type.label, styles.flex]}>{s.heartRate != null ? `${Math.round(s.heartRate)} BPM` : "—"}</Text>
                  <Text style={type.caption}>{s.activity ? ACTIVITY_COPY[s.activity] : ""}</Text>
                </View>
              ))}
          </Card>
        </>
      ) : null}

      <Card tone="neutral" style={styles.privacy}>
        <IconBadge icon={Lock} tone="brand" size={32} />
        <Text style={[type.caption, styles.flex]} maxFontSizeMultiplier={1.8}>
          Simulated for this prototype, never a diagnosis. Shared with your Huddle only while health sharing is on, and it turns off when you leave the Huddle.
        </Text>
      </Card>
    </Screen>
  );
}

function Tile({ icon, tone, label, value }: { icon: LucideIcon; tone: Tone; label: string; value: string }) {
  return (
    <Card style={styles.tile} accessibilityLabel={`${label}: ${value}`}>
      <IconBadge icon={icon} tone={tone} size={32} />
      <Text style={type.caption}>{label}</Text>
      <Text style={type.heading} maxFontSizeMultiplier={1.4}>
        {value}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: space(2) },
  flex: { flex: 1 },
  hero: { gap: space(3) },
  heroHead: { flexDirection: "row", alignItems: "center", gap: space(3) },
  metricRow: { flexDirection: "row", alignItems: "flex-end", gap: space(1.5) },
  unit: { fontSize: 15, fontFamily: fonts.semibold, fontWeight: "600", color: colors.inkMuted, marginBottom: 7 },
  baseline: { alignItems: "flex-end", gap: 2, marginBottom: 5 },
  baselineValue: { fontSize: 15, fontFamily: fonts.semibold, fontWeight: "600", color: colors.ink },
  chartEmpty: { height: 96, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.blushSoft },
  tiles: { flexDirection: "row", gap: space(3) },
  tile: { flex: 1, gap: space(1.5) },
  signalRow: { flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(4), minHeight: 48 },
  signalBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  time: { width: 92, fontVariant: ["tabular-nums"] },
  privacy: { flexDirection: "row", alignItems: "center", gap: space(3) },
});
