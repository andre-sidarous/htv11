import { router, Stack } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DEMO_ACTION_IDS, demoActions, type DemoActionId } from "@/features/demo/demoActions";
import { getDemoContext, SEEDED_DEMO_CONTEXT, setDemoContext, subscribeDemoContext } from "@/features/demo/demoContext";
import { runStory, type StepStatus, type StoryProgress } from "@/features/demo/storyRunner";
import { useDemoActions } from "@/hooks/useDemoActions";
import { useJamChannel } from "@/hooks/useJamChannel";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fonts, colors, radius, shadow, space, TAP_TARGET, type } from "@/theme";
import { currentUserId, getMemberNames } from "./api";
import { buildDemoStory, setStoryRunning, storyIncidentId, storyPreflight } from "./demoStory";
import { SessionGate } from "./SessionGate";
import { useAlertDemoActions } from "./useAlertDemoActions";

/** The demo script, in order (docs/demo.md). Anything else that's registered appears under "More actions". */
const SCRIPT: { id: DemoActionId; label: string; hint?: string }[] = [
  { id: DEMO_ACTION_IDS.resetDemo, label: "Reset demo" },
  { id: DEMO_ACTION_IDS.moveAffectedUserAway, label: "Move affected user away" },
  { id: DEMO_ACTION_IDS.triggerRouteDeviation, label: "Trigger route deviation" },
  { id: DEMO_ACTION_IDS.triggerHeartRateSpike, label: "Trigger heart-rate spike" },
  { id: DEMO_ACTION_IDS.triggerRunning, label: "Trigger running" },
  { id: DEMO_ACTION_IDS.sendCheckIn, label: "Send check-in" },
  { id: DEMO_ACTION_IDS.simulateNoResponse, label: "Simulate no response", hint: "Skips the check-in wait" },
  { id: DEMO_ACTION_IDS.simulateNoGroupResponse, label: "Simulate no group response", hint: "The AI call starts on their phone" },
  { id: DEMO_ACTION_IDS.simulateAiNonResponse, label: "Simulate AI non-response", hint: "Skips the 10s silence; contacts get called" },
  { id: DEMO_ACTION_IDS.sendIncidentPackage, label: "Send incident package", hint: "Backup if the contact wasn't called" },
  { id: DEMO_ACTION_IDS.showDisruption, label: "Show transit disruption" },
  { id: DEMO_ACTION_IDS.showAlternativeRoute, label: "Show alternative route" },
  { id: DEMO_ACTION_IDS.resolveIncident, label: "Resolve incident" },
];
const SCRIPT_IDS = new Set<string>(SCRIPT.map((s) => s.id));
/** Same job as a script step (P4 registered its own copy); kept out of "More actions". */
const DUPLICATES = new Set<string>([DEMO_ACTION_IDS.createIncidentPackage, DEMO_ACTION_IDS.resolveAlert]);

type RunState = { status: "running" | "ok" | "error"; message?: string };

const useDemoContext = () => useSyncExternalStore(subscribeDemoContext, getDemoContext, getDemoContext);

/** OWNER: P5. The single Demo Control panel (route: /demo-control). */
export function DemoControlPanel() {
  return (
    <>
      <Stack.Screen options={{ title: "Demo Control" }} />
      <SessionGate>
        <Panel />
      </SessionGate>
    </>
  );
}

function Panel() {
  const context = useDemoContext();
  const channel = useJamChannel(context.jamId);
  useAlertDemoActions(channel);
  const registered = useDemoActions();
  const [runs, setRuns] = useState<Record<string, RunState>>({});

  // ---- the automated story ----
  const [story] = useState(buildDemoStory);
  const [progress, setProgress] = useState<StoryProgress | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const cancelled = useRef(false);
  const storyRunning = Boolean(progress && !progress.finished);
  useEffect(() => {
    if (!storyRunning) return;
    const timer = setInterval(() => setTick(Date.now()), 250);
    return () => clearInterval(timer);
  }, [storyRunning]);
  useEffect(() => {
    let active = true;
    void storyPreflight().then((w) => active && setWarnings(w));
    return () => {
      active = false;
    };
  }, [context.jamId, context.affectedUserId]);

  async function startStory() {
    cancelled.current = false;
    setIncidentId(null);
    await setStoryRunning(true).catch(() => undefined);
    const result = await runStory(story, { onProgress: setProgress, isCancelled: () => cancelled.current });
    setIncidentId(storyIncidentId);
    await setStoryRunning(false).catch(() => undefined);
    setProgress(result);
  }

  function stopStory() {
    cancelled.current = true;
  }
  const [jams, setJams] = useState<{ id: string; name: string; isHost: boolean }[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);

  // Jams I'm in, so the presenter can pick the live one if Demo Mode didn't set it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = getSupabaseClient();
      const me = await currentUserId();
      if (!supabase || !me) return;
      const { data } = await supabase
        .from("jam_members")
        .select("jam_id, jams(name, host_id, status)")
        .eq("user_id", me)
        .eq("is_active", true);
      if (cancelled) return;
      const list = (data ?? []).flatMap((row) => {
        const jam = (Array.isArray(row.jams) ? row.jams[0] : row.jams) as { name: string; host_id: string; status: string } | null;
        return jam && jam.status !== "ended" ? [{ id: row.jam_id as string, name: jam.name, isHost: jam.host_id === me }] : [];
      });
      setJams(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getMemberNames(context.jamId).then((names) => {
      if (!cancelled) setMembers(Object.entries(names).map(([id, name]) => ({ id, name })));
    });
    return () => {
      cancelled = true;
    };
  }, [context.jamId]);

  async function run(id: string, label: string) {
    if (id === DEMO_ACTION_IDS.resetDemo) {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert("Reset the demo?", "Clears alerts, incidents, notifications, health signals, and live locations for this Huddle. Accounts, members, and contacts stay.", [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Reset", style: "destructive", onPress: () => resolve(true) },
        ]),
      );
      if (!ok) return;
    }
    setRuns((r) => ({ ...r, [id]: { status: "running" } }));
    try {
      await demoActions.run(id);
      setRuns((r) => ({ ...r, [id]: { status: "ok", message: `${label}: done` } }));
    } catch (e) {
      setRuns((r) => ({ ...r, [id]: { status: "error", message: e instanceof Error ? e.message : "Failed" } }));
    }
  }

  const jamName = jams.find((j) => j.id === context.jamId)?.name ?? (context.jamId === SEEDED_DEMO_CONTEXT.jamId ? "Campus Walk (seeded backup)" : "Unknown Huddle");
  const extras = registered.filter((a) => !SCRIPT_IDS.has(a.id) && !DUPLICATES.has(a.id));
  // Map (P3) and health (P4) actions register while that Jam's screens are mounted on this phone.
  const missing = SCRIPT.filter((s) => !demoActions.has(s.id)).length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={type.heading}>Huddle being demoed</Text>
        <Text style={type.body}>{jamName}</Text>
        <Text style={styles.mono}>{context.jamId}</Text>
        {jams.length > 0 ? (
          <View style={styles.chips}>
            {jams.map((j) => (
              <Chip key={j.id} label={j.isHost ? `${j.name} (host)` : j.name} selected={j.id === context.jamId} onPress={() => setDemoContext({ jamId: j.id })} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={type.heading}>Affected user</Text>
        <Text style={type.caption}>Every demo action targets this person.</Text>
        <View style={styles.chips}>
          {members.length === 0 ? <Text style={type.caption}>No members found for this Huddle.</Text> : null}
          {members.map((m) => (
            <Chip key={m.id} label={m.name} selected={m.id === context.affectedUserId} onPress={() => setDemoContext({ affectedUserId: m.id })} />
          ))}
        </View>
      </View>

      <View style={[styles.card, styles.storyCard]}>
        <Text style={type.heading}>Automated demo</Text>
        <Text style={type.caption}>Two taps to set the scene, then one tap runs the whole story on its own. Read the line in bold aloud.</Text>
        <ActionRow index={1} label="Reset demo" available={demoActions.has(DEMO_ACTION_IDS.resetDemo)} state={runs[DEMO_ACTION_IDS.resetDemo]} onPress={() => run(DEMO_ACTION_IDS.resetDemo, "Reset demo")} />
        <ActionRow
          index={2}
          label="Move affected user away"
          available={demoActions.has(DEMO_ACTION_IDS.moveAffectedUserAway)}
          state={runs[DEMO_ACTION_IDS.moveAffectedUserAway]}
          onPress={() => run(DEMO_ACTION_IDS.moveAffectedUserAway, "Move affected user away")}
        />
        {warnings.length && !storyRunning ? (
          <View style={styles.warnings}>
            {warnings.map((w) => (
              <Text key={w} style={[type.caption, styles.warnText]}>
                · {w}
              </Text>
            ))}
          </View>
        ) : null}
        {storyRunning ? (
          <Pressable accessibilityRole="button" onPress={stopStory} style={({ pressed }) => [styles.action, styles.stop, pressed && styles.pressed]}>
            <Text style={styles.actionText}>Stop the story</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => void startStory()} style={({ pressed }) => [styles.action, styles.play, pressed && styles.pressed]}>
            <Text style={styles.actionText}>3. ▶ Run the rest automatically</Text>
          </Pressable>
        )}

        {progress ? (
          <View style={styles.steps}>
            {progress.current >= 0 && !progress.finished ? (
              <Text style={styles.narration} accessibilityLiveRegion="polite">
                {story[progress.current]?.narration}
              </Text>
            ) : null}
            {story.map((step, i) => (
              <StoryRow
                key={step.id}
                title={step.title}
                status={progress.statuses[i] ?? "pending"}
                secondsLeft={i === progress.current && progress.startsAt ? Math.max(0, Math.ceil((progress.startsAt - tick) / 1000)) : null}
              />
            ))}
            {progress.error ? <Text style={[type.caption, styles.error]}>{progress.error}</Text> : null}
            {progress.finished && incidentId ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/incident/[token]", params: { token: incidentId } })}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Text style={styles.actionText}>Open the incident package</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {missing > 0 ? (
        <View style={[styles.card, styles.notice]}>
          <Text style={type.heading}>Open the Huddle once</Text>
          <Text style={type.body}>
            {missing === 1 ? "1 step is" : `${missing} steps are`} unavailable because the map and safety tools load with the Huddle. Open
            it, then come back with Settings → Demo this Huddle.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/jam/[jamId]/map", params: { jamId: context.jamId } })}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text style={styles.actionText}>Open the Huddle</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={type.heading}>Demo script</Text>
        {SCRIPT.map((step, i) => (
          <ActionRow
            key={step.id}
            index={i + 1}
            label={step.label}
            hint={step.hint}
            available={demoActions.has(step.id)}
            state={runs[step.id]}
            onPress={() => run(step.id, step.label)}
          />
        ))}
      </View>

      {extras.length > 0 ? (
        <View style={styles.card}>
          <Text style={type.heading}>More actions</Text>
          {extras.map((a) => (
            <ActionRow key={a.id} label={`${a.label} (${a.owner})`} available state={runs[a.id]} onPress={() => run(a.id, a.label)} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function ActionRow({
  index,
  label,
  hint,
  available,
  state,
  onPress,
}: {
  index?: number;
  label: string;
  hint?: string;
  available: boolean;
  state?: RunState;
  onPress: () => void;
}) {
  const running = state?.status === "running";
  return (
    <View style={styles.actionRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={available ? label : `${label}, unavailable`}
        accessibilityState={{ disabled: !available || running, busy: running }}
        disabled={!available || running}
        onPress={onPress}
        style={({ pressed }) => [styles.action, !available && styles.unavailable, pressed && styles.pressed]}
      >
        <Text style={[styles.actionText, !available && styles.unavailableText]}>
          {index ? `${index}. ` : ""}
          {label}
        </Text>
        {running ? <ActivityIndicator color={colors.warmWhite} /> : !available ? <Text style={styles.unavailableTag}>unavailable</Text> : null}
      </Pressable>
      {state?.message ? (
        <Text style={[type.caption, state.status === "error" ? styles.error : styles.ok]}>{state.message}</Text>
      ) : hint ? (
        <Text style={type.caption}>{hint}</Text>
      ) : null}
    </View>
  );
}

const STEP_MARK: Record<StepStatus, string> = { pending: "○", waiting: "◔", running: "●", done: "✓", failed: "✕", skipped: "–" };

function StoryRow({ title, status, secondsLeft }: { title: string; status: StepStatus; secondsLeft: number | null }) {
  const active = status === "waiting" || status === "running";
  return (
    <View style={styles.storyRow} accessibilityLabel={`${title}: ${status}`}>
      <Text style={[styles.storyMark, status === "done" && styles.ok, status === "failed" && styles.error, active && styles.activeMark]}>{STEP_MARK[status]}</Text>
      <Text style={[type.body, styles.flexText, !active && status !== "done" && styles.dimText, active && styles.activeText]}>{title}</Text>
      {status === "waiting" && secondsLeft !== null ? <Text style={styles.countdown}>in {secondsLeft}s</Text> : null}
      {status === "running" ? <ActivityIndicator color={colors.brand} /> : null}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: space(4), padding: space(4), paddingBottom: space(12) },
  card: { gap: space(2), padding: space(5), borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  storyCard: { borderWidth: 1, borderColor: colors.brand },
  play: { backgroundColor: colors.brand },
  stop: { backgroundColor: colors.escalation },
  steps: { gap: space(2), marginTop: space(2) },
  narration: { ...type.body, fontWeight: "700", color: colors.ink, padding: space(3), borderRadius: radius.sm, backgroundColor: colors.blushSoft },
  storyRow: { flexDirection: "row", alignItems: "center", gap: space(2), minHeight: 28 },
  storyMark: { width: 18, textAlign: "center", fontSize: 15, color: colors.inkFaint },
  activeMark: { color: colors.brand },
  flexText: { flex: 1 },
  dimText: { color: colors.inkMuted },
  activeText: { fontWeight: "700", color: colors.brand },
  countdown: { fontSize: 13, color: colors.brand, fontVariant: ["tabular-nums"] },
  warnings: { gap: space(1), padding: space(3), borderRadius: radius.sm, backgroundColor: colors.amberSoft },
  warnText: { color: colors.amberInk },
  notice: { borderWidth: 1, borderColor: colors.amber },
  mono: { fontFamily: "monospace", fontSize: 11, color: colors.inkMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  chip: { minHeight: 40, paddingHorizontal: space(4), justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { color: colors.ink, fontSize: 14 },
  chipTextSelected: { color: colors.warmWhite, fontFamily: fonts.semibold, fontWeight: "600" },
  actionRow: { gap: space(1) },
  action: {
    minHeight: TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space(4),
    borderRadius: radius.sm,
    backgroundColor: colors.navy,
  },
  actionText: { color: colors.warmWhite, fontSize: 15, fontFamily: fonts.semibold, fontWeight: "600" },
  unavailable: { backgroundColor: colors.border },
  unavailableText: { color: colors.inkMuted },
  unavailableTag: { fontSize: 12, color: colors.inkMuted },
  pressed: { opacity: 0.85 },
  ok: { color: colors.ok },
  error: { color: colors.escalation },
});
