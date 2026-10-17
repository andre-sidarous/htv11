import { Stack } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DEMO_ACTION_IDS, demoActions, type DemoActionId } from "@/features/demo/demoActions";
import { getDemoContext, SEEDED_DEMO_CONTEXT, setDemoContext, subscribeDemoContext } from "@/features/demo/demoContext";
import { useDemoActions } from "@/hooks/useDemoActions";
import { useJamChannel } from "@/hooks/useJamChannel";
import { getSupabaseClient } from "@/lib/supabase/client";
import { colors, radius, shadow, space, TAP_TARGET, type } from "@/theme";
import { currentUserId, getMemberNames } from "./api";
import { SessionGate } from "./SessionGate";
import { useAlertDemoActions } from "./useAlertDemoActions";

/** The demo script, in order. Anything else that's registered appears under "More actions". */
const SCRIPT: { id: DemoActionId; label: string }[] = [
  { id: DEMO_ACTION_IDS.resetDemo, label: "Reset demo" },
  { id: DEMO_ACTION_IDS.moveAffectedUserAway, label: "Move affected user away" },
  { id: DEMO_ACTION_IDS.triggerRouteDeviation, label: "Trigger route deviation" },
  { id: DEMO_ACTION_IDS.triggerHeartRateSpike, label: "Trigger heart-rate spike" },
  { id: DEMO_ACTION_IDS.triggerRunning, label: "Trigger running" },
  { id: DEMO_ACTION_IDS.triggerSuddenStop, label: "Trigger sudden stop" },
  { id: DEMO_ACTION_IDS.sendCheckIn, label: "Send check-in" },
  { id: DEMO_ACTION_IDS.simulateNoResponse, label: "Simulate no response" },
  { id: DEMO_ACTION_IDS.simulateNoGroupResponse, label: "Simulate no group response" },
  { id: DEMO_ACTION_IDS.startAiCall, label: "Start AI call" },
  { id: DEMO_ACTION_IDS.simulateAiRecording, label: "Simulate AI recording" },
  { id: DEMO_ACTION_IDS.sendIncidentPackage, label: "Send incident package" },
  { id: DEMO_ACTION_IDS.resolveIncident, label: "Resolve incident" },
];
const SCRIPT_IDS = new Set<string>(SCRIPT.map((s) => s.id));

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
        Alert.alert("Reset the demo?", "Clears alerts, incidents, notifications, health signals, and live locations for this Jam. Accounts, members, and contacts stay.", [
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

  const jamName = jams.find((j) => j.id === context.jamId)?.name ?? (context.jamId === SEEDED_DEMO_CONTEXT.jamId ? "Campus Walk (seeded backup)" : "Unknown Jam");
  const extras = registered.filter((a) => !SCRIPT_IDS.has(a.id));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={type.heading}>Jam being demoed</Text>
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
          {members.length === 0 ? <Text style={type.caption}>No members found for this Jam.</Text> : null}
          {members.map((m) => (
            <Chip key={m.id} label={m.name} selected={m.id === context.affectedUserId} onPress={() => setDemoContext({ affectedUserId: m.id })} />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={type.heading}>Demo script</Text>
        {SCRIPT.map((step, i) => (
          <ActionRow key={step.id} index={i + 1} label={step.label} available={demoActions.has(step.id)} state={runs[step.id]} onPress={() => run(step.id, step.label)} />
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

function ActionRow({ index, label, available, state, onPress }: { index?: number; label: string; available: boolean; state?: RunState; onPress: () => void }) {
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
      {state?.message ? <Text style={[type.caption, state.status === "error" ? styles.error : styles.ok]}>{state.message}</Text> : null}
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
  mono: { fontFamily: "monospace", fontSize: 11, color: colors.inkMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  chip: { minHeight: 40, paddingHorizontal: space(4), justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { color: colors.ink, fontSize: 14 },
  chipTextSelected: { color: colors.warmWhite, fontWeight: "600" },
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
  actionText: { color: colors.warmWhite, fontSize: 15, fontWeight: "600" },
  unavailable: { backgroundColor: colors.border },
  unavailableText: { color: colors.inkMuted },
  unavailableTag: { fontSize: 12, color: colors.inkMuted },
  pressed: { opacity: 0.85 },
  ok: { color: colors.ok },
  error: { color: colors.escalation },
});
