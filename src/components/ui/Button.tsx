import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, space, TAP_TARGET } from "@/theme";
import { Icon, type LucideIcon } from "./Icon";

/**
 * primary: burgundy, the one main action per view · secondary: blush · outline: white with a fine
 * border · ghost: text only · destructive: red, ONLY for confirmed escalation / irreversible actions.
 */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: LucideIcon;
  size?: "md" | "lg";
  /** Overrides the label/icon colour (e.g. on dark surfaces). */
  tint?: string;
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
  icon,
  size = "md",
  tint,
  disabled,
  loading,
  accessibilityHint,
  haptic = true,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const fg = tint ?? textColors[variant];

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
        size === "lg" && styles.large,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon icon={icon} size={size === "lg" ? 20 : 18} color={fg} strokeWidth={2} /> : null}
          <Text style={[styles.label, size === "lg" && styles.labelLarge, { color: fg }]} maxFontSizeMultiplier={1.6}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TAP_TARGET,
    paddingHorizontal: space(5),
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: space(2),
  },
  large: { minHeight: 56, borderRadius: radius.lg },
  label: { fontSize: 16, fontWeight: "600" },
  labelLarge: { fontSize: 17 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
});

const variantStyles: Record<ButtonVariant, StyleProp<ViewStyle>> = {
  primary: { backgroundColor: colors.brand },
  secondary: { backgroundColor: colors.blush },
  outline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: "transparent" },
  destructive: { backgroundColor: colors.escalation },
};

const textColors: Record<ButtonVariant, string> = {
  primary: colors.surface,
  secondary: colors.brand,
  outline: colors.ink,
  ghost: colors.brand,
  destructive: colors.surface,
};
