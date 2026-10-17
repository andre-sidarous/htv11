import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, shadow, space } from "@/theme";

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && styles.padded, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  padded: { padding: space(5), gap: space(2) },
});
