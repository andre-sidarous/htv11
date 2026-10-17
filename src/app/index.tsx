import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isSupabaseConfigured, mockServicesEnabled } from "@/lib/env";
import { colors, radius, shadow, space, TAP_TARGET, type } from "@/theme";

/** Placeholder home. P2 replaces this with the welcome / home screens. */
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View>
          <Text style={type.display}>Jam</Text>
          <Text style={[type.body, styles.muted]}>Travel together. Jam quietly looks out for your group.</Text>
        </View>

        <View style={styles.card}>
          <Text style={type.heading}>Foundation is running</Text>
          <Text style={type.caption}>Supabase: {isSupabaseConfigured ? "configured" : "not configured"}</Text>
          <Text style={type.caption}>Services: {mockServicesEnabled ? "mock (no credentials needed)" : "live"}</Text>
        </View>

        <Link href="/dev" asChild>
          <Pressable accessibilityRole="button" style={styles.button}>
            <Text style={styles.buttonText}>Open developer check</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.warmWhite },
  content: { flex: 1, justifyContent: "center", gap: space(6), padding: space(6) },
  muted: { color: colors.inkMuted, marginTop: space(2) },
  card: { gap: space(1), padding: space(5), borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  button: {
    minHeight: TAP_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
  },
  buttonText: { color: colors.warmWhite, fontSize: 16, fontWeight: "600" },
});
