import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, space, TAP_TARGET } from "@/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Shared button. Fires a light haptic on tap (disable with `haptic={false}` for frequent taps). */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  accessibilityHint,
  haptic = true,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  function handlePress() {
    if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "destructive" ? colors.warmWhite : colors.navy} />
      ) : (
        <Text
          style={[styles.label, textStyles[variant]]}
          maxFontSizeMultiplier={1.6}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TAP_TARGET,
    paddingHorizontal: space(5),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: space(2),
  },
  label: { fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
});

const variantStyles: Record<ButtonVariant, StyleProp<ViewStyle>> = {
  primary: { backgroundColor: colors.navy },
  secondary: { backgroundColor: colors.sky },
  ghost: { backgroundColor: "transparent" },
  destructive: { backgroundColor: colors.escalation },
};

const textStyles: Record<ButtonVariant, { color: string }> = {
  primary: { color: colors.warmWhite },
  secondary: { color: colors.navy },
  ghost: { color: colors.navy },
  destructive: { color: colors.warmWhite },
};
