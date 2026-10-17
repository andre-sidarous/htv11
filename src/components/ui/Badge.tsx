import { StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "@/theme";

export type BadgeTone = "neutral" | "amber" | "ok" | "escalation";

const toneStyles: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.sky, fg: colors.navy },
  amber: { bg: colors.amberSoft, fg: colors.amber },
  ok: { bg: colors.okSoft, fg: colors.ok },
  escalation: { bg: colors.escalationSoft, fg: colors.escalation },
};

/** Small status pill. Pair with a text label elsewhere too — color is never the only signal. */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: space(3), paddingVertical: space(1), borderRadius: radius.pill, alignSelf: "flex-start" },
  text: { fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
});
