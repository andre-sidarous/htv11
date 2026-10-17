import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { colors, fonts } from "@/theme";

/**
 * The Huddle logo. Until the wordmark artwork (the penguin "u") is ready, this sets the name in
 * Inter Bold in the brand burgundy. When the art lands, swap the body for an <Image> or SvgXml
 * here; every screen uses this component, so nothing else changes.
 */
export function HuddleLogo({
  size = 40,
  tagline = false,
  align = "center",
  style,
}: {
  /** Font size of the wordmark. */
  size?: number;
  tagline?: boolean;
  align?: "center" | "left";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.wrap, align === "left" && styles.left, style]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={tagline ? `${APP_NAME}. ${APP_TAGLINE}` : APP_NAME}
    >
      <Text style={[styles.word, { fontSize: size, letterSpacing: -size * 0.03 }]} maxFontSizeMultiplier={1.3}>
        {APP_NAME}
      </Text>
      {tagline ? (
        <Text style={[styles.tagline, { fontSize: Math.max(14, size * 0.38) }]} maxFontSizeMultiplier={1.4}>
          {APP_TAGLINE}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  left: { alignItems: "flex-start" },
  word: { fontFamily: fonts.bold, fontWeight: "700", color: colors.brand },
  tagline: { fontFamily: fonts.medium, fontWeight: "500", color: colors.brandMuted, marginTop: 2 },
});
