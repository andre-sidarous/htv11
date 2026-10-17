import { StyleSheet, Text, View } from "react-native";
import { fonts, radius, space, tones, type Tone } from "@/theme";
import { Icon, type LucideIcon } from "./Icon";

export type BadgeTone = Tone;

/** Small status pill. Pair with a text label elsewhere too — color is never the only signal. */
export function Badge({ label, tone = "neutral", icon }: { label: string; tone?: BadgeTone; icon?: LucideIcon }) {
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {icon ? <Icon icon={icon} size={13} color={t.fg} strokeWidth={2.25} /> : null}
      <Text style={[styles.text, { color: t.fg }]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1),
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  text: { fontSize: 12, fontFamily: fonts.bold, fontWeight: "700", letterSpacing: 0.2 },
});
