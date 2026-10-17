import * as Linking from "expo-linking";
import QRCode from "react-native-qrcode-svg";
import { Share, StyleSheet, Text } from "react-native";
import { Button, Card } from "@/components/ui";
import { APP_SLOGAN_CTA } from "@/lib/constants";
import { fonts, colors, space, type } from "@/theme";

/**
 * Join code, QR (`JAM:{code}`), and a Share button. Used in the lobby and in the Group tab, since
 * people can still join while a Jam is running (join_jam only refuses ended Jams).
 */
export function InviteCard({ joinCode, jamName, note }: { joinCode: string; jamName: string; note?: string }) {
  async function handleShare() {
    const link = Linking.createURL(`join/${joinCode}`);
    try {
      await Share.share({ message: `Join my Huddle "${jamName}" on Huddle.\nCode: ${joinCode}\n${link}\n\n${APP_SLOGAN_CTA}` });
    } catch {
      // The user dismissed the share sheet — nothing to do.
    }
  }

  return (
    <Card style={styles.card}>
      <QRCode value={`JAM:${joinCode}`} size={160} color={colors.navy} backgroundColor={colors.surface} />
      <Text style={styles.code} accessibilityLabel={`Join code ${joinCode.split("").join(" ")}`}>
        {joinCode}
      </Text>
      {note ? (
        <Text style={[type.caption, styles.note]} maxFontSizeMultiplier={1.6}>
          {note}
        </Text>
      ) : null}
      <Button label="Share" variant="secondary" onPress={() => void handleShare()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", gap: space(3) },
  code: { fontSize: 24, fontFamily: fonts.bold, fontWeight: "700", letterSpacing: 4, color: colors.navy },
  note: { textAlign: "center" },
});
