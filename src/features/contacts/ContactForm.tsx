import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import type { ConfirmationStatus } from "@/lib/types";
import { fonts, colors, radius, space, TAP_TARGET, type } from "@/theme";
import { CONFIRMATION_LABELS, validateContact, type ContactFieldErrors, type ContactFormValues, type ContactInput } from "./schema";

type Props = {
  initial: ContactFormValues;
  title: string;
  /** Resolve with an error message, or null on success. */
  onSubmit: (input: ContactInput) => Promise<string | null>;
  onCancel: () => void;
};

const STATUSES: ConfirmationStatus[] = ["pending", "confirmed", "declined"];

export function ContactForm({ initial, title, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<ContactFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = <K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function submit() {
    const result = validateContact(values);
    if (!result.ok) return setErrors(result.errors);
    setSaving(true);
    setSaveError(null);
    const error = await onSubmit(result.data);
    setSaving(false);
    if (error) setSaveError(error);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={12} style={styles.headerButton}>
          <Text style={styles.headerAction}>Cancel</Text>
        </Pressable>
        <Text style={type.heading} accessibilityRole="header">
          {title}
        </Text>
        <Pressable accessibilityRole="button" onPress={submit} disabled={saving} hitSlop={12} style={styles.headerButton}>
          {saving ? <ActivityIndicator color={colors.navy} /> : <Text style={[styles.headerAction, styles.bold]}>Save</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Field label="Name" error={errors.name} value={values.name} onChangeText={(v) => set("name", v)} autoComplete="name" />
        <Field
          label="Relationship"
          hint="Optional, e.g. Sister, Roommate"
          error={errors.relationship}
          value={values.relationship}
          onChangeText={(v) => set("relationship", v)}
        />
        <Field
          label="Phone number"
          hint="Huddle calls this number if it can't reach you. Include the country code, e.g. +1 416 555 0123."
          error={errors.phone_number}
          value={values.phone_number}
          onChangeText={(v) => set("phone_number", v)}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
        <Field
          label="Email"
          hint="Optional. If they sign in to Huddle with this email, they can open the incident details in the app."
          error={errors.email}
          value={values.email}
          onChangeText={(v) => set("email", v)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <Text style={[type.heading, styles.section]}>What they can know</Text>
        <Text style={type.caption}>Only if Huddle can’t reach you. Everything is off until you turn it on.</Text>
        <ToggleRow
          label="Your location"
          description="Where you were last seen."
          value={values.receive_location}
          onChange={(v) => set("receive_location", v)}
        />
        <ToggleRow
          label="Health and activity summary"
          description="Why Huddle was concerned, e.g. running or a high heart rate."
          value={values.receive_health_summary}
          onChange={(v) => set("receive_health_summary", v)}
        />
        <ToggleRow
          label="Incident recording"
          description="Audio from the AI support call, if you allowed recording."
          value={values.receive_recording}
          onChange={(v) => set("receive_recording", v)}
        />

        <Text style={[type.heading, styles.section]}>Have they agreed?</Text>
        <View style={styles.segment} accessibilityRole="radiogroup">
          {STATUSES.map((status) => {
            const selected = values.confirmation_status === status;
            return (
              <Pressable
                key={status}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => set("confirmation_status", status)}
                style={[styles.segmentItem, selected && styles.segmentSelected]}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{CONFIRMATION_LABELS[status]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={type.caption}>Huddle won’t call contacts marked as declined.</Text>

        {saveError ? (
          <Text accessibilityRole="alert" style={[type.body, styles.error]}>
            {saveError}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, hint, error, ...input }: { label: string; hint?: string; error?: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} accessibilityHint={hint} style={[styles.input, error && styles.inputError]} {...input} />
      {error ? <Text style={[type.caption, styles.error]}>{error}</Text> : hint ? <Text style={type.caption}>{hint}</Text> : null}
    </View>
  );
}

function ToggleRow({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={type.body}>{label}</Text>
        <Text style={type.caption}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.navy, false: colors.border }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.warmWhite,
  },
  headerButton: { minWidth: 64, minHeight: TAP_TARGET, justifyContent: "center" },
  headerAction: { color: colors.navy, fontSize: 16 },
  bold: { fontFamily: fonts.bold, fontWeight: "700", textAlign: "right" },
  body: { gap: space(3), padding: space(5), paddingBottom: space(12) },
  field: { gap: space(1) },
  label: { fontSize: 15, fontFamily: fonts.semibold, fontWeight: "600", color: colors.ink },
  input: {
    minHeight: TAP_TARGET,
    paddingHorizontal: space(4),
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.ink,
  },
  inputError: { borderColor: colors.escalation },
  error: { color: colors.escalation },
  section: { marginTop: space(3) },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(2) },
  segment: { flexDirection: "row", gap: space(2) },
  segmentItem: {
    flex: 1,
    minHeight: TAP_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space(2),
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  segmentText: { fontSize: 13, color: colors.ink, textAlign: "center" },
  segmentTextSelected: { color: colors.warmWhite, fontFamily: fonts.semibold, fontWeight: "600" },
});
