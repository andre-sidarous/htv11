import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, space, tones, type, type Tone } from "@/theme";
import { Icon, IconBadge, type LucideIcon } from "./Icon";

/** Small uppercase label above a group of cards, with an optional trailing action. */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={type.overline} accessibilityRole="header" maxFontSizeMultiplier={1.6}>
        {title}
      </Text>
      {action}
    </View>
  );
}

/** Settings-style row: icon, label, optional detail, chevron. Put several inside a `Card padded={false}`. */
export function ListRow({
  icon,
  label,
  detail,
  onPress,
  tone = "brand",
  last,
}: {
  icon?: LucideIcon;
  label: string;
  detail?: string;
  onPress: () => void;
  tone?: Tone;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.pressed]}
    >
      {icon ? <IconBadge icon={icon} tone={tone} size={32} /> : null}
      <View style={styles.rowText}>
        <Text style={type.body} maxFontSizeMultiplier={1.6}>
          {label}
        </Text>
        {detail ? (
          <Text style={type.caption} maxFontSizeMultiplier={1.6}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Icon icon={ChevronRight} size={18} color={colors.inkFaint} />
    </Pressable>
  );
}

/** A coloured dot, always paired with a text label (colour is never the only signal). */
export function StatusDot({ tone = "ok", size = 8 }: { tone?: Tone; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tones[tone].fg }} />;
}

const styles = StyleSheet.create({
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(2) },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(4), paddingVertical: space(2) },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { flex: 1, gap: 2 },
  pressed: { backgroundColor: colors.blushSoft },
});
