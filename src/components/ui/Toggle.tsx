import * as Haptics from "expo-haptics";
import { StyleSheet, Switch, Text, View } from "react-native";
import { colors, space, type } from "@/theme";

/** A labeled row with a switch, used for consent toggles and settings. */
export function Toggle({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  function handleChange(next: boolean) {
    void Haptics.selectionAsync();
    onValueChange(next);
  }

  return (
    <View
      style={styles.row}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      accessibilityHint={description}
    >
      <View style={styles.text}>
        <Text style={type.body} maxFontSizeMultiplier={1.8}>
          {label}
        </Text>
        {description ? (
          <Text style={[type.caption, styles.description]} maxFontSizeMultiplier={1.8}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={handleChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.navySoft }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(1) },
  text: { flex: 1, gap: space(1) },
  description: { lineHeight: 18 },
});
