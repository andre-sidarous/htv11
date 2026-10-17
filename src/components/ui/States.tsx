import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Pico } from "@/components/brand/Pico";
import { fonts, colors, radius, space, TAP_TARGET, type } from "@/theme";

/** Shared loading / empty / error states. P2 may restyle; keep the props stable. */

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <Pico mood="waiting" size={96} />
      <ActivityIndicator size="large" color={colors.navy} />
      <Text style={[type.body, styles.muted]}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  action,
  mascot = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Show Pico above the title (off by default, so existing screens are unchanged). */
  mascot?: boolean;
}) {
  return (
    <View style={styles.card}>
      {mascot ? <Pico mood="waiting" size={72} /> : null}
      <Text style={[type.heading, styles.centerText]}>{title}</Text>
      {description ? <Text style={[type.body, styles.muted, styles.centerText]}>{description}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({
  title = "Something didn't load",
  description = "Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={[type.heading, styles.centerText]}>{title}</Text>
      <Text style={[type.body, styles.muted, styles.centerText]}>{description}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space(3), padding: space(8) },
  card: { alignItems: "center", gap: space(2), padding: space(8), borderRadius: radius.card, backgroundColor: colors.surface },
  centerText: { textAlign: "center" },
  muted: { color: colors.inkMuted },
  action: { marginTop: space(2) },
  button: {
    marginTop: space(2),
    minHeight: TAP_TARGET,
    paddingHorizontal: space(6),
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
  },
  buttonText: { color: colors.warmWhite, fontSize: 16, fontFamily: fonts.semibold, fontWeight: "600" },
});
