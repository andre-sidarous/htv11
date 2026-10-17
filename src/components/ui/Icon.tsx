import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { colors, radius, tones, type Tone } from "@/theme";

export type { LucideIcon };

/** Lucide defaults for Jam: 1.75 stroke, 20pt, ink. Import icons from "lucide-react-native". */
export function Icon({ icon: Glyph, size = 20, color = colors.ink, strokeWidth = 1.75 }: { icon: LucideIcon; size?: number; color?: string; strokeWidth?: number }) {
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} accessibilityElementsHidden importantForAccessibility="no" />;
}

/** A tinted rounded square holding an icon, for list rows and card headers. Decorative only. */
export function IconBadge({ icon, tone = "brand", size = 36 }: { icon: LucideIcon; tone?: Tone; size?: number }) {
  const t = tones[tone];
  return (
    <View style={[styles.badge, { width: size, height: size, backgroundColor: t.bg }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon icon={icon} size={Math.round(size * 0.5)} color={t.fg} strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
});
