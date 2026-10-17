import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import QRCode from "react-native-qrcode-svg";
import { Share, StyleSheet, Text, View } from "react-native";
import { Badge, Button, Card, ErrorState, LoadingState, Screen } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import { colors, space, type } from "@/theme";
import { startJam } from "./jamsApi";
import { memberReadiness, memberReadinessLabel } from "./memberStatus";
import { useJam } from "./useJam";
import { useJamMembers } from "./useJamMembers";

/** Host and members wait here until the host taps Start Jam, then everyone moves into the tabs. */
export function LobbyScreen({ jamId }: { jamId: string }) {
  const router = useRouter();
  const { session } = useSession();
  const { jam, loading: jamLoading, error: jamError, refresh } = useJam(jamId);
  const { members, loading: membersLoading } = useJamMembers(jamId);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHost = Boolean(jam && session && jam.host_id === session.user.id);

  useEffect(() => {
    if (jam?.status === "active") router.replace(`/jam/${jamId}/map`);
  }, [jam?.status, jamId, router]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    const result = await startJam(jamId);
    setStarting(false);
    if (result.error) setError(result.error);
    // Navigation happens via the effect above once the realtime "jams" update lands.
  }

  async function handleShare(joinCode: string, name: string) {
    const link = Linking.createURL(`join/${joinCode}`);
    try {
      await Share.share({
        message: `Join my Jam "${name}" on Jam.\nCode: ${joinCode}\n${link}`,
      });
    } catch {
      // The user dismissed the share sheet — nothing to do.
    }
  }

  if (jamLoading) return <LoadingState label="Loading lobby…" />;
  if (jamError || !jam) {
    return (
      <View style={styles.center}>
        <ErrorState description={jamError ?? "This Jam could not be found."} onRetry={() => void refresh()} />
      </View>
    );
  }

  const host = members.find((m) => m.role === "host");

  return (
    <Screen scroll>
      <View>
        <Text style={type.title}>{jam.name}</Text>
        <Text style={type.bodyMuted} maxFontSizeMultiplier={1.6}>
          {jam.destination_name ?? "No destination set yet"}
        </Text>
      </View>

      <Card style={styles.qrCard}>
        <QRCode value={`JAM:${jam.join_code}`} size={160} color={colors.navy} backgroundColor={colors.surface} />
        <Text style={styles.code} accessibilityLabel={`Join code ${jam.join_code.split("").join(" ")}`}>
          {jam.join_code}
        </Text>
        <Button label="Share" variant="secondary" onPress={() => handleShare(jam.join_code, jam.name)} />
      </Card>

      <Card>
        <Text style={type.heading}>Host</Text>
        <Text style={type.body}>{host?.profile?.display_name ?? "—"}</Text>
      </Card>

      <View style={styles.section}>
        <Text style={type.heading}>Members ({members.length})</Text>
        {membersLoading ? (
          <Text style={type.caption}>Loading…</Text>
        ) : (
          members.map((member) => (
            <Card key={member.id} style={styles.memberRow}>
              <Text style={type.body}>
                {member.profile?.display_name ?? "Member"}
                {member.role === "host" ? " · Host" : ""}
              </Text>
              <Badge
                label={memberReadinessLabel(member)}
                tone={memberReadiness(member) === "ready" ? "ok" : "neutral"}
              />
            </Card>
          ))
        )}
      </View>

      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.escalation }}>
          {error}
        </Text>
      ) : null}

      {isHost ? (
        <Button label="Start Jam" onPress={handleStart} loading={starting} />
      ) : (
        <Text style={type.caption} accessibilityLiveRegion="polite">
          Waiting for the host to start the Jam…
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", backgroundColor: colors.warmWhite },
  qrCard: { alignItems: "center", gap: space(3) },
  code: { fontSize: 24, fontWeight: "700", letterSpacing: 4, color: colors.navy },
  section: { gap: space(2) },
  memberRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
