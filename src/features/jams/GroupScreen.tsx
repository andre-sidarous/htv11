import { useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { MessageCircleQuestionMark, UserPlus } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, Badge, Button, Card, ErrorState, LoadingState, Screen } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import { useJamChannel } from "@/hooks/useJamChannel";
import { PRESENCE_OFFLINE_AFTER_MS, PRESENCE_STALE_AFTER_MS } from "@/lib/constants";
import { space, type } from "@/theme";
import { InviteCard } from "./InviteCard";
import { useJam } from "./useJam";
import { useJamMembers, type JamMemberWithProfile } from "./useJamMembers";
import { useLiveLocations } from "./useLiveLocations";

type Presence = "live" | "stale" | "offline" | "unavailable";

function presenceFor(lastSeenAt: string | undefined, sharingEnabled: boolean | undefined): Presence {
  if (!lastSeenAt || sharingEnabled === false) return "unavailable";
  const ageMs = Date.now() - new Date(lastSeenAt).getTime();
  if (ageMs < PRESENCE_STALE_AFTER_MS) return "live";
  if (ageMs < PRESENCE_OFFLINE_AFTER_MS) return "stale";
  return "offline";
}

const PRESENCE_COPY: Record<Presence, string> = {
  live: "Live",
  stale: "Signal is lagging",
  offline: "Offline",
  unavailable: "Not sharing location",
};

const PRESENCE_TONE: Record<Presence, "ok" | "amber" | "neutral"> = {
  live: "ok",
  stale: "amber",
  offline: "neutral",
  unavailable: "neutral",
};

/** Member roster: presence, last seen, activity, and a one-tap group check-in. */
export function GroupScreen({ jamId }: { jamId: string }) {
  const { session } = useSession();
  const { members, loading, error, refresh } = useJamMembers(jamId);
  const { jam } = useJam(jamId);
  const { byUserId: locations } = useLiveLocations(jamId);
  const channel = useJamChannel(jamId);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Presence is derived from a timestamp, so re-render periodically to keep it fresh.
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(timer);
  }, []);

  async function handleCheckIn() {
    if (!channel || !session) return;
    setSending(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await channel.send("checkin_requested", {
        jamId,
        requestedBy: session.user.id,
        reason: "group_manual",
        timestamp: new Date().toISOString(),
      });
      setSent(true);
      setTimeout(() => setSent(false), 4_000);
    } finally {
      setSending(false);
    }
  }

  if (loading) return <LoadingState label="Loading group…" />;
  if (error && members.length === 0) return <ErrorState description={error} onRetry={() => void refresh()} />;

  const activeCount = members.filter((m) => m.is_active).length;
  // People can join a running Jam; only an ended one refuses new members.
  const canInvite = Boolean(jam && jam.status !== "ended");
  const alone = activeCount <= 1;

  return (
    <Screen scroll>
      <Text style={type.title}>Group</Text>
      <Button
        label={sent ? "Check-in sent" : "Check in with group"}
        icon={MessageCircleQuestionMark}
        size="lg"
        onPress={handleCheckIn}
        loading={sending}
        disabled={sent || !channel}
        accessibilityHint="Asks everyone in the Jam to confirm they're okay."
      />

      {canInvite && jam ? (
        alone ? (
          <View style={styles.invite}>
            <Text style={type.heading}>Invite your group</Text>
            <Text style={type.bodyMuted} maxFontSizeMultiplier={1.6}>
              {"It's just you so far. Friends can join with this code or QR, even though the Jam has started."}
            </Text>
            <InviteCard joinCode={jam.join_code} jamName={jam.name} />
          </View>
        ) : (
          <View style={styles.invite}>
            <Button
              label={inviteOpen ? "Hide invite" : "Invite people"}
              icon={UserPlus}
              variant="secondary"
              onPress={() => setInviteOpen((open) => !open)}
              accessibilityHint="Shows the join code, QR code, and share button."
            />
            {inviteOpen ? (
              <InviteCard joinCode={jam.join_code} jamName={jam.name} note="New members appear here as they join." />
            ) : null}
          </View>
        )
      ) : null}

      <View style={styles.list}>
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            location={locations.get(member.user_id)}
            isSelf={member.user_id === session?.user.id}
          />
        ))}
      </View>
    </Screen>
  );
}

function MemberRow({
  member,
  location,
  isSelf,
}: {
  member: JamMemberWithProfile;
  location: { last_seen_at: string; sharing_enabled: boolean; activity: string | null } | undefined;
  isSelf: boolean;
}) {
  const name = member.profile?.display_name ?? "Member";
  const presence = member.location_consent ? presenceFor(location?.last_seen_at, location?.sharing_enabled) : "unavailable";

  return (
    <Card style={styles.row}>
      <Avatar name={name} ring={presence === "live" ? "ok" : undefined} />
      <View style={styles.rowText}>
        <Text style={type.body} maxFontSizeMultiplier={1.6}>
          {name}
          {isSelf ? " (you)" : ""}
        </Text>
        <Text style={type.caption} maxFontSizeMultiplier={1.6}>
          {member.location_consent
            ? location?.activity
              ? `Activity: ${location.activity.replace("_", " ")}`
              : "No location yet"
            : "Location sharing paused"}
        </Text>
        {location?.last_seen_at ? (
          <Text style={type.caption}>Last seen {new Date(location.last_seen_at).toLocaleTimeString()}</Text>
        ) : null}
      </View>
      <Badge label={PRESENCE_COPY[presence]} tone={PRESENCE_TONE[presence]} />
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: space(3) },
  invite: { gap: space(3) },
  row: { flexDirection: "row", alignItems: "center", gap: space(3) },
  rowText: { flex: 1, gap: space(1) },
});
