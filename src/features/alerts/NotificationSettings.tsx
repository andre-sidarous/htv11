import * as Clipboard from "expo-clipboard";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { getDemoContext } from "@/features/demo/demoContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { NotificationChannel, NotificationStatus } from "@/lib/types";
import { colors, radius, shadow, space, TAP_TARGET, type } from "@/theme";
import { formatAgo } from "./presentation";
import { SessionGate } from "./SessionGate";

type EventRow = { channel: NotificationChannel; status: NotificationStatus; detail: string | null; created_at: string };
type Info = { jamName: string; topic: string; events: EventRow[] };

const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  ntfy: "ntfy push",
  in_app: "In-app alert",
  voice_call: "Phone call to a trusted contact",
  sms: "Text to a trusted contact",
  sms_preview: "SMS preview",
};
const STATUS_LABEL: Record<NotificationStatus, string> = { sent: "Sent", skipped: "Skipped", failed: "Failed" };
const NTFY_BASE = "https://ntfy.sh";

/** Server log details look like "contact:<uuid> call:<sid>"; show only the human part. */
const friendlyDetail = (detail: string | null) =>
  (detail ?? "").replace(/contact:[0-9a-f-]{36}\s*/gi, "").replace(/(call|sms):\S+/gi, "").replace(/_/g, " ").trim();

/** OWNER: P5. Notification settings and status for a Jam (route: /notifications?jamId=...). */
export function NotificationSettings({ jamId }: { jamId?: string }) {
  return (
    <>
      <Stack.Screen options={{ title: "Notifications" }} />
      <SessionGate>
        <Body jamId={jamId || getDemoContext().jamId} />
      </SessionGate>
    </>
  );
}

function Body({ jamId }: { jamId: string }) {
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInfo = useCallback(async (): Promise<Info | null> => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const [{ data: jam }, { data: events }] = await Promise.all([
      supabase.from("jams").select("name, ntfy_topic").eq("id", jamId).maybeSingle(),
      supabase.from("notification_events").select("channel, status, detail, created_at").eq("jam_id", jamId).order("created_at", { ascending: false }).limit(15),
    ]);
    return jam ? { jamName: jam.name, topic: jam.ntfy_topic, events: (events ?? []) as EventRow[] } : null;
  }, [jamId]);

  useEffect(() => {
    let cancelled = false;
    void fetchInfo().then((i) => !cancelled && setInfo(i));
    return () => {
      cancelled = true;
    };
  }, [fetchInfo]);

  async function refresh() {
    setRefreshing(true);
    setInfo(await fetchInfo());
    setRefreshing(false);
  }

  if (info === undefined) return <LoadingState />;
  if (info === null) {
    return (
      <View style={styles.center}>
        <EmptyState title="No Jam selected" description="Open this from a Jam you're in." />
      </View>
    );
  }

  const lastNtfy = info.events.find((e) => e.channel === "ntfy");
  const lastCall = info.events.find((e) => e.channel === "voice_call");
  const ntfyState = !lastNtfy ? "Not used yet" : lastNtfy.status === "sent" ? "Working" : "Unavailable: in-app alerts are the fallback";
  const callState = !lastCall
    ? "Not used yet"
    : lastCall.status === "sent"
      ? "Working"
      : friendlyDetail(lastCall.detail) || STATUS_LABEL[lastCall.status];

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <View style={styles.card}>
        <Text style={type.heading}>Push notifications (ntfy)</Text>
        <Text style={type.body}>
          Get a push even when Jam is closed: install the free <Text style={styles.bold}>ntfy</Text> app and subscribe to this Jam’s private topic.
        </Text>
        <Text selectable style={styles.topic}>
          {info.topic}
        </Text>
        <View style={styles.actions}>
          <Action
            label="Copy topic"
            onPress={async () => {
              await Clipboard.setStringAsync(info.topic);
              Alert.alert("Copied", "Paste it into ntfy → Subscribe to topic.");
            }}
          />
          <Action label="Open in ntfy" onPress={() => void Linking.openURL(`${NTFY_BASE}/${info.topic}`)} />
        </View>
        <Text style={type.caption}>Status: {ntfyState}</Text>
        <Text style={type.caption}>ntfy only ever says “A Jam member may need support. Open the Jam app to view details.” No names, locations, or health data.</Text>
      </View>

      <View style={styles.card}>
        <Text style={type.heading}>Trusted-contact calls and texts</Text>
        <Text style={type.body}>If someone stays silent on Jam’s support call, Jam phones and texts the trusted contacts they chose.</Text>
        <Text style={type.caption}>Status: {callState}</Text>
      </View>

      <View style={styles.card}>
        <Text style={type.heading}>Recent notifications · {info.jamName}</Text>
        {info.events.length === 0 ? <Text style={type.caption}>Nothing sent yet.</Text> : null}
        {info.events.map((e, i) => (
          <View key={`${e.created_at}-${i}`} style={styles.event}>
            <Text style={type.body}>
              {CHANNEL_LABEL[e.channel]} · <Text style={e.status === "sent" ? styles.ok : styles.muted}>{STATUS_LABEL[e.status]}</Text>
            </Text>
            <Text style={type.caption}>
              {formatAgo(e.created_at)}
              {friendlyDetail(e.detail) ? ` · ${friendlyDetail(e.detail)}` : ""}
            </Text>
          </View>
        ))}
        <Text style={type.caption}>In-app alerts always show, even if every other channel fails.</Text>
      </View>
    </ScrollView>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: space(6), backgroundColor: colors.warmWhite },
  content: { gap: space(4), padding: space(4), paddingBottom: space(12) },
  card: { gap: space(2), padding: space(5), borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  bold: { fontWeight: "700" },
  topic: { fontFamily: "monospace", fontSize: 14, color: colors.navy, padding: space(3), borderRadius: radius.sm, backgroundColor: colors.sky },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  action: { minHeight: TAP_TARGET, paddingHorizontal: space(5), justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  actionText: { color: colors.navy, fontSize: 15, fontWeight: "600" },
  pressed: { opacity: 0.85 },
  event: { gap: 2, paddingVertical: space(1), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  ok: { color: colors.ok, fontWeight: "600" },
  muted: { color: colors.inkMuted },
});
