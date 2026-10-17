import { StyleSheet, Text, View } from "react-native";
import { fonts, colors, radius } from "@/theme";

/** A simple initials avatar. `ring` draws a colored ring (e.g. for "currently live"). */
export function Avatar({ name, size = 44, ring }: { name: string; size?: number; ring?: "ok" | "amber" | "escalation" | "brand" }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const ringColor = ring ? { ok: colors.ok, amber: colors.amber, escalation: colors.escalation, brand: colors.brand }[ring] : "transparent";

  return (
    <View
      style={[
        styles.outer,
        { width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, borderColor: ringColor },
      ]}
    >
      <View style={[styles.inner, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.text, { fontSize: size * 0.4 }]} accessibilityElementsHidden maxFontSizeMultiplier={1.2}>
          {initial}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { borderWidth: 2, alignItems: "center", justifyContent: "center" },
  inner: { backgroundColor: colors.blush, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  text: { color: colors.brand, fontFamily: fonts.bold, fontWeight: "700" },
});
