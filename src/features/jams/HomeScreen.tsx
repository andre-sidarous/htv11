import { useRouter } from "expo-router";
import { ChevronRight, Contact, FlaskConical, LogOut, MapPin, Plus, QrCode, ShieldCheck, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, Badge, Button, Card, Icon, IconBadge, ListRow, Screen, SectionHeader } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import { signOut } from "@/lib/supabase/auth";
import type { JamRow } from "@/lib/types";
import { colors, radius, shadow, space, type, type Tone } from "@/theme";
import { useJamMembers } from "./useJamMembers";
import { useMyJams, type MyJam } from "./useMyJams";

const STATUS_BADGE: Record<JamRow["status"], { label: string; tone: Tone }> = {
  waiting: { label: "Waiting for members", tone: "amber" },
  active: { label: "Active", tone: "ok" },
  ended: { label: "Ended", tone: "neutral" },
};

export function HomeScreen() {
  const router = useRouter();
  const { profile, session } = useSession();
  const { active, past, loading, error, refresh } = useMyJams(session?.user.id);
  const featured = active[0] ?? null;
  const name = profile?.display_name ?? "there";

  function openJam({ jam }: MyJam) {
    if (jam.status === "waiting") router.push(`/jam/${jam.id}/lobby`);
    else router.push(`/jam/${jam.id}/map`);
  }

  return (
    <Screen scroll>
      <View style={styles.brandRow}>
        <Text style={styles.wordmark} accessibilityRole="header">
          Jam
        </Text>
        <Avatar name={name} size={36} />
      </View>

      <View style={styles.hero}>
        <Text style={type.title} maxFontSizeMultiplier={1.4}>
          Hi, {name}
        </Text>
        <Text style={type.bodyMuted} maxFontSizeMultiplier={1.6}>
          Travel together. Jam quietly looks out for your group.
        </Text>
      </View>

      {featured ? <StatusHero pair={featured} onOpen={() => openJam(featured)} /> : null}

      <View style={styles.quickRow}>
        <QuickAction icon={Plus} label="Create a Jam" onPress={() => router.push("/create")} primary />
        <QuickAction icon={QrCode} label="Join a Jam" onPress={() => router.push("/join")} />
      </View>

      <SectionHeader title="Active Jams" />
      {loading ? (
        <Text style={type.caption}>Loading…</Text>
      ) : error ? (
        <Card>
          <Text style={type.body}>Couldn’t load your Jams.</Text>
          <Button label="Try again" variant="ghost" onPress={() => void refresh()} />
        </Card>
      ) : active.length === 0 ? (
        <Card tone="neutral">
          <Text style={type.label}>No active Jam yet</Text>
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
              <IconBadge icon={MapPin} tone="brand" />
              <View style={styles.jamText}>
                <Text style={type.heading}>{pair.jam.name}</Text>
                <Text style={type.caption}>{pair.jam.destination_name ?? "No destination set"}</Text>
                <Badge label={STATUS_BADGE[pair.jam.status].label} tone={STATUS_BADGE[pair.jam.status].tone} />
              </View>
              <Icon icon={ChevronRight} size={18} color={colors.inkFaint} />
            </Card>
          </Pressable>
        ))
      )}

      {past.length > 0 ? (
        <>
          <SectionHeader title="Past Jams" />
          <Card padded={false}>
            {past.slice(0, 5).map((pair, i, list) => (
              <View key={pair.jam.id} style={[styles.pastRow, i < list.length - 1 && styles.pastBorder]}>
                <View style={styles.jamText}>
                  <Text style={type.body}>{pair.jam.name}</Text>
                  <Text style={type.caption}>{pair.jam.destination_name ?? "No destination set"}</Text>
                </View>
                <Badge label="Ended" tone="neutral" />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="More" />
      <Card padded={false}>
        <ListRow icon={Contact} label="Emergency contacts" onPress={() => router.push("/contacts")} />
        <ListRow icon={ShieldCheck} tone="sage" label="Privacy defaults" onPress={() => router.push("/privacy")} />
        <ListRow icon={FlaskConical} tone="lavender" label="Demo Mode" onPress={() => router.push("/demo")} last />
      </Card>

      <Button label="Sign out" icon={LogOut} variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}

/** Burgundy status card for the current Jam: connection state, destination, who's in it. */
function StatusHero({ pair, onOpen }: { pair: MyJam; onOpen: () => void }) {
  const { members } = useJamMembers(pair.jam.id);
  const people = members.filter((m) => m.is_active);
  const waiting = pair.jam.status === "waiting";

  return (
    <View style={styles.statusCard}>
      <View style={styles.statusHead}>
        <View style={styles.liveDot} />
        <Text style={styles.statusOverline}>{waiting ? "Lobby open" : "You’re connected"}</Text>
      </View>
      <Text style={styles.statusTitle} maxFontSizeMultiplier={1.4}>
        {pair.jam.name}
      </Text>
      <Text style={styles.statusBody} maxFontSizeMultiplier={1.6}>
        {pair.jam.destination_name ? `Heading to ${pair.jam.destination_name}` : "No destination set"}
      </Text>
      <View style={styles.statusFoot}>
        <View style={styles.avatars} accessibilityLabel={`${people.length} ${people.length === 1 ? "person" : "people"} in this Jam`}>
          {people.slice(0, 5).map((m, i) => (
            <View key={m.id} style={[styles.avatarSlot, i > 0 && styles.avatarOverlap]}>
              <Avatar name={m.profile?.display_name ?? "?"} size={30} />
            </View>
          ))}
          <Text style={styles.statusCount}>{people.length > 5 ? `+${people.length - 5}` : `${people.length} in Jam`}</Text>
        </View>
        <Button label={waiting ? "Open lobby" : "Open Jam"} onPress={onOpen} variant="secondary" tint={colors.brandDark} style={styles.statusButton} />
      </View>
    </View>
  );
}

function QuickAction({ icon, label, onPress, primary }: { icon: LucideIcon; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.quick, primary && styles.quickPrimary, pressed && styles.pressed]}>
      <Icon icon={icon} size={22} color={primary ? colors.surface : colors.brand} strokeWidth={2} />
      <Text style={[type.label, primary && styles.quickPrimaryText]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  wordmark: { fontSize: 28, fontWeight: "800", letterSpacing: -0.8, color: colors.brand },
  hero: { gap: space(1) },
  statusCard: { gap: space(2), padding: space(5), borderRadius: radius.lg, backgroundColor: colors.brand, ...shadow.raised },
  statusHead: { flexDirection: "row", alignItems: "center", gap: space(2) },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sage },
  statusOverline: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.blush },
  statusTitle: { fontSize: 22, fontWeight: "700", color: colors.surface },
  statusBody: { fontSize: 15, color: colors.blush },
  statusFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(3), marginTop: space(2) },
  avatars: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  avatarSlot: { borderRadius: radius.pill, backgroundColor: colors.brand },
  avatarOverlap: { marginLeft: -10 },
  statusCount: { marginLeft: space(2), fontSize: 13, fontWeight: "600", color: colors.blush },
  statusButton: { backgroundColor: colors.surface, paddingHorizontal: space(4) },
  quickRow: { flexDirection: "row", gap: space(3) },
  quick: {
    flex: 1,
    minHeight: 84,
    gap: space(2),
    padding: space(4),
    justifyContent: "space-between",
    borderRadius: radius.card,
    backgroundColor: colors.blush,
  },
  quickPrimary: { backgroundColor: colors.brandDark },
  quickPrimaryText: { color: colors.surface },
  jamRow: { flexDirection: "row", alignItems: "center", gap: space(3) },
  jamText: { flex: 1, gap: space(1) },
  pastRow: { flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(4), minHeight: 60 },
  pastBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { opacity: 0.88 },
});
