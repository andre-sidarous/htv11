import { forwardRef } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, radius, space, TAP_TARGET, type } from "@/theme";

export type TextFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, style, ...inputProps },
  ref,
) {
  return (
    <View style={styles.wrap}>
      <Text style={type.label} maxFontSizeMultiplier={1.8}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.inkFaint}
        style={[styles.input, error && styles.inputError, style]}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" maxFontSizeMultiplier={1.8}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={type.caption} maxFontSizeMultiplier={1.8}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space(1.5) },
  input: {
    minHeight: TAP_TARGET,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space(4),
    fontSize: 16,
    color: colors.ink,
  },
  inputError: { borderColor: colors.escalation },
  error: { fontSize: 13, color: colors.escalation },
});
