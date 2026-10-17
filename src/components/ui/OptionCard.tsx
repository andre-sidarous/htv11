import type { ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space, type } from "@/theme";

/** A selectable card for single-choice pickers (travel mode, emergency preference, demo role). */
export function OptionCard({
  title,
  description,
  selected,
  onPress,
  icon,
}: {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <View style={styles.text}>
        <Text style={[type.body, selected && styles.selectedTitle]} maxFontSizeMultiplier={1.8}>
          {title}
        </Text>
        {description ? (
          <Text style={type.caption} maxFontSizeMultiplier={1.8}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    padding: space(4),
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.navy, backgroundColor: colors.sky },
  pressed: { opacity: 0.9 },
  icon: { width: 28, alignItems: "center" },
  text: { flex: 1, gap: space(1) },
  selectedTitle: { color: colors.navy, fontWeight: "700" },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: { borderColor: colors.navy },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.navy },
});
