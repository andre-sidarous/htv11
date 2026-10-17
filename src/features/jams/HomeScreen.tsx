import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Button, Card, Screen } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import { signOut } from "@/lib/supabase/auth";
import type { JamRow } from "@/lib/types";
import { colors, space, type } from "@/theme";
import { useMyJams, type MyJam } from "./useMyJams";

const STATUS_BADGE: Record<JamRow["status"], { label: string; tone: "neutral" | "ok" | "amber" }> = {
  waiting: { label: "Waiting for members", tone: "amber" },
  active: { label: "Active", tone: "ok" },
  ended: { label: "Ended", tone: "neutral" },
};

export function HomeScreen() {
  const router = useRouter();
  const { profile, session } = useSession();
  const { active, past, loading, error, refresh } = useMyJams(session?.user.id);

  function openJam({ jam }: MyJam) {
    if (jam.status === "waiting") router.push(`/jam/${jam.id}/lobby`);
    else router.push(`/jam/${jam.id}/map`);
  }

  return (
    <Screen scroll>
      <View style={styles.hero}>
        <Text style={type.display} maxFontSizeMultiplier={1.4}>
          Hi, {profile?.display_name ?? "there"}
        </Text>
        <Text style={type.bodyMuted} maxFontSizeMultiplier={1.6}>
          Travel together. Jam quietly looks out for your group.
        </Text>
      </View>

      <View style={styles.primaryRow}>
        <Button label="Create a Jam" onPress={() => router.push("/create")} style={styles.primaryButton} />
        <Button
          label="Join a Jam"
          variant="secondary"
          onPress={() => router.push("/join")}
          style={styles.primaryButton}
        />
      </View>

      <View style={styles.section}>
        <Text style={type.heading}>Active Jams</Text>
        {loading ? (
          <Text style={type.caption}>Loading…</Text>
        ) : error ? (
          <Card>
            <Text style={type.body}>Couldn’t load your Jams.</Text>
            <Button label="Try again" variant="ghost" onPress={() => void refresh()} />
          </Card>
        ) : active.length === 0 ? (
          <Card>
            <Text style={type.body}>No active Jam yet.</Text>
            <Text style={type.caption}>Create one, or join with a code from a friend.</Text>
          </Card>
        ) : (
          active.map((pair) => (
            <Pressable
              key={pair.jam.id}
              accessibilityRole="button"
              accessibilityLabel={`${pair.jam.name}, ${STATUS_BADGE[pair.jam.status].label}`}
              onPress={() => openJam(pair)}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Card style={styles.jamRow}>
                <View style={styles.jamText}>
                  <Text style={type.heading}>{pair.jam.name}</Text>
                  <Text style={type.caption}>{pair.jam.destination_name ?? "No destination set"}</Text>
                </View>
                <Badge label={STATUS_BADGE[pair.jam.status].label} tone={STATUS_BADGE[pair.jam.status].tone} />
              </Card>
            </Pressable>
          ))
        )}
      </View>

      {past.length > 0 ? (
        <View style={styles.section}>
          <Text style={type.heading}>Past Jams</Text>
          {past.slice(0, 5).map((pair) => (
            <Card key={pair.jam.id} style={styles.jamRow}>
              <View style={styles.jamText}>
                <Text style={type.body}>{pair.jam.name}</Text>
                <Text style={type.caption}>{pair.jam.destination_name ?? "No destination set"}</Text>
              </View>
              <Badge label="Ended" tone="neutral" />
            </Card>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={type.heading}>More</Text>
        <Card style={{ gap: space(1) }} padded={false}>
          <LinkRow label="Emergency contacts" onPress={() => router.push("/contacts")} />
          <LinkRow label="Privacy defaults" onPress={() => router.push("/privacy")} />
          <LinkRow label="Demo Mode" onPress={() => router.push("/demo")} last />
        </Card>
      </View>

      <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}

function LinkRow({ label, onPress, last }: { label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, !last && styles.linkRowBorder, pressed && styles.pressed]}
    >
      <Text style={type.body}>{label}</Text>
      <Text style={[type.body, { color: colors.inkFaint }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space(2) },
  primaryRow: { flexDirection: "row", gap: space(3) },
  primaryButton: { flex: 1 },
  section: { gap: space(3) },
  jamRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(3) },
  jamText: { flex: 1, gap: space(1) },
  linkRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space(5),
  },
  linkRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pressed: { opacity: 0.85 },
});
