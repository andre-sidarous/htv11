import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text } from "react-native";
import { fonts, colors, radius, space, type } from "@/theme";

/** A compact selectable pill, for short single-choice lists (travel mode, duration, etc.). */
export function Chip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
    >
      <Text style={[type.body, selected && styles.chipTextSelected]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    paddingHorizontal: space(4),
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.navy, backgroundColor: colors.sky },
  chipDisabled: { opacity: 0.5 },
  chipTextSelected: { color: colors.navy, fontFamily: fonts.bold, fontWeight: "700" },
});
