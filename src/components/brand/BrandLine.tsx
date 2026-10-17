import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { colors, fonts } from "@/theme";

/**
 * A handwritten brand line ("Just Huddle N' Waddle.", the brand promise) in Caveat. Only for these
 * short lines, at 20pt or more; everything else stays Inter. Keep brand lines out of alert, call,
 * and incident screens.
 */
export function BrandLine({
  text,
  size = 24,
  tone = "brand",
  style,
}: {
  text: string;
  size?: number;
  tone?: "brand" | "muted";
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      style={[styles.line, { fontSize: Math.max(20, size), lineHeight: Math.max(20, size) * 1.2 }, tone === "muted" && styles.muted, style]}
      maxFontSizeMultiplier={1.4}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { fontFamily: fonts.script, color: colors.brand, textAlign: "center" },
  muted: { color: colors.brandMuted },
});
