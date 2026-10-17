import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { fonts, colors, radius, space, TAP_TARGET } from "@/theme";

/** Small map-local controls. If P2's shared `@/components/ui` primitives land, these can switch over. */

export function PillButton({
  label,
  onPress,
  variant = "primary",
  accessibilityHint,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "quiet";
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.button, styles[variant], pressed && styles.pressed, style]}
    >
      <Text style={[styles.label, variant === "primary" ? styles.labelPrimary : styles.labelSecondary]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "attention" | "ok" }) {
  return (
    <View style={[styles.badge, tone === "attention" && styles.badgeAttention, tone === "ok" && styles.badgeOk]}>
      <Text style={styles.badgeText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TAP_TARGET,
    paddingHorizontal: space(5),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  primary: { backgroundColor: colors.navy },
  secondary: { backgroundColor: colors.sky },
  quiet: { backgroundColor: "transparent", paddingHorizontal: space(3) },
  pressed: { opacity: 0.75 },
  label: { fontSize: 15, fontFamily: fonts.semibold, fontWeight: "600" },
  labelPrimary: { color: colors.warmWhite },
  labelSecondary: { color: colors.navy },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: space(2),
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.sky,
  },
  badgeAttention: { backgroundColor: colors.amberSoft },
  badgeOk: { backgroundColor: colors.okSoft },
  badgeText: { fontSize: 12, fontFamily: fonts.semibold, fontWeight: "600", color: colors.navy },
});
