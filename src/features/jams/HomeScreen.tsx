import { useRouter } from "expo-router";
import { ChevronRight, Contact, FlaskConical, LogOut, MapPin, Plus, QrCode, ShieldCheck, User, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { BrandLine, HuddleLogo, PenguinHuddle } from "@/components/brand";
import { Avatar, Badge, Button, Card, Icon, IconBadge, ListRow, Screen, SectionHeader } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import { APP_SLOGAN_CTA } from "@/lib/constants";
import { signOut } from "@/lib/supabase/auth";
import type { JamRow } from "@/lib/types";
import { fonts, colors, radius, shadow, space, tones, type, type Tone } from "@/theme";
import { joinJamByCode } from "./jamsApi";
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

  // Left by accident? Rejoin a Huddle that's still running (same as entering its code again).
  const [rejoining, setRejoining] = useState<string | null>(null);
  async function rejoin(pair: MyJam) {
    setRejoining(pair.jam.id);
    const { error } = await joinJamByCode(pair.jam.join_code);
    setRejoining(null);
    if (error) {
      Alert.alert("Couldn’t rejoin", error);
      return;
    }
    void refresh();
    openJam(pair);
  }

  return (
    <Screen scroll>
      <View style={styles.brandRow}>
        <HuddleLogo variant="wordmark" height={36} />
        <Avatar name={name} size={36} />
      </View>

      <View style={styles.hero}>
        <Text style={type.title} maxFontSizeMultiplier={1.4}>
          Hi, {name}
        </Text>
        <Text style={type.bodyMuted} maxFontSizeMultiplier={1.6}>
          Travel together. Huddle quietly looks out for your group.
        </Text>
      </View>

      {!loading && !error ? (
        <View style={styles.summaryRow} accessibilityRole="summary">
          <SummaryStat label="Active" value={active.length} tone="ok" />
          <SummaryStat label="Completed" value={past.length} tone="neutral" />
          <SummaryStat label="Total" value={active.length + past.length} tone="brand" />
        </View>
      ) : null}

      {featured ? <StatusHero pair={featured} onOpen={() => openJam(featured)} /> : null}

      {!loading && !error && active.length === 0 ? (
        <View style={styles.huddleHero}>
          <PenguinHuddle height={170} />
          <BrandLine text={APP_SLOGAN_CTA} size={26} />
        </View>
      ) : null}

      <View style={styles.quickRow}>
        <QuickAction icon={Plus} label="Create a Huddle" onPress={() => router.push("/create")} primary />
        <QuickAction icon={QrCode} label="Join a Huddle" onPress={() => router.push("/join")} />
      </View>

      <Button label="Travelling alone? Start a Solo Huddle" icon={User} variant="outline" onPress={() => router.push("/solo")} />

      <SectionHeader title="Active Huddles" />
      {loading ? (
        <Text style={type.caption}>Loading…</Text>
      ) : error ? (
        <Card>
          <Text style={type.body}>Couldn’t load your Huddles.</Text>
          <Button label="Try again" variant="ghost" onPress={() => void refresh()} />
        </Card>
      ) : active.length === 0 ? (
        <Card tone="neutral">
          <Text style={type.label}>No active Huddle yet</Text>
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
          <SectionHeader title="Past Huddles" />
          <Card padded={false}>
            {past.slice(0, 5).map((pair, i, list) => (
              <View key={pair.jam.id} style={[styles.pastRow, i < list.length - 1 && styles.pastBorder]}>
                <View style={styles.jamText}>
                  <Text style={type.body}>{pair.jam.name}</Text>
                  <Text style={type.caption}>{pair.jam.destination_name ?? "No destination set"}</Text>
                </View>
                {pair.jam.status !== "ended" && !pair.membership.is_active ? (
                  <Button
                    label="Rejoin"
                    variant="secondary"
                    loading={rejoining === pair.jam.id}
                    onPress={() => void rejoin(pair)}
                    accessibilityHint={`Rejoins ${pair.jam.name}, which is still running`}
                  />
                ) : (
                  <Badge label="Ended" tone="neutral" />
                )}
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
        <View style={styles.avatars} accessibilityLabel={`${people.length} ${people.length === 1 ? "person" : "people"} in this Huddle`}>
          {people.slice(0, 5).map((m, i) => (
            <View key={m.id} style={[styles.avatarSlot, i > 0 && styles.avatarOverlap]}>
              <Avatar name={m.profile?.display_name ?? "?"} size={30} />
            </View>
          ))}
          <Text style={styles.statusCount}>{people.length > 5 ? `+${people.length - 5}` : `${people.length} in Huddle`}</Text>
        </View>
        <Button label={waiting ? "Open lobby" : "Open Huddle"} onPress={onOpen} variant="secondary" tint={colors.brandDark} style={styles.statusButton} />
      </View>
    </View>
  );
}

/** A single number in the at-a-glance Huddles summary (e.g. "2 Active"). */
function SummaryStat({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const t = tones[tone];
  return (
    <View style={[styles.statChip, { backgroundColor: t.bg }]} accessibilityLabel={`${value} ${label}`}>
      <Text style={[styles.statValue, { color: t.fg }]} maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: t.fg }]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
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
  huddleHero: { alignItems: "center", gap: space(1), paddingVertical: space(2) },
  hero: { gap: space(1) },
  summaryRow: { flexDirection: "row", gap: space(2) },
  statChip: { flex: 1, alignItems: "center", gap: 2, paddingVertical: space(3), borderRadius: radius.card },
  statValue: { fontSize: 24, fontFamily: fonts.bold, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: "600" },
  statusCard: { gap: space(2), padding: space(5), borderRadius: radius.lg, backgroundColor: colors.brand, ...shadow.raised },
  statusHead: { flexDirection: "row", alignItems: "center", gap: space(2) },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sage },
  statusOverline: { fontSize: 12, fontFamily: fonts.bold, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.blush },
  statusTitle: { fontSize: 22, fontFamily: fonts.bold, fontWeight: "700", color: colors.surface },
  statusBody: { fontSize: 15, color: colors.blush },
  statusFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(3), marginTop: space(2) },
  avatars: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  avatarSlot: { borderRadius: radius.pill, backgroundColor: colors.brand },
  avatarOverlap: { marginLeft: -10 },
  statusCount: { marginLeft: space(2), fontSize: 13, fontFamily: fonts.semibold, fontWeight: "600", color: colors.blush },
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
