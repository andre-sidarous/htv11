import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, shadow, space, tones, type Tone } from "@/theme";

/**
 * White card with a fine border and soft shadow. `tone` makes a flat pastel card for
 * secondary information (blush, lavender, sage, amber…).
 */
export function Card({
  children,
  style,
  padded = true,
  tone,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  tone?: Tone;
  accessibilityLabel?: string;
}) {
  return (
    <View
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, tone ? { backgroundColor: tones[tone].bg, borderColor: "transparent" } : styles.raised, padded && styles.padded, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  raised: shadow.card,
  padded: { padding: space(4), gap: space(2) },
});
