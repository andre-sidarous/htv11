import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import type { AlertRow, EscalationState } from "@/lib/types";
import { colors, radius, space, TAP_TARGET, type } from "@/theme";

/** Calm, short status lines for the affected user. No "danger" language, no fake precision. */
export const STATE_COPY: Record<EscalationState, string> = {
  MONITORING: "Jam is keeping an eye on things.",
  CHECK_IN_SENT: "Jam noticed a combination of changes and is checking in.",
  USER_RESPONDED: "Thanks for letting us know.",
  GROUP_ALERT_SENT: "Your group has been notified.",
  GROUP_MEMBER_ACKNOWLEDGED: "Someone from your group is responding.",
  AI_CALL_STARTING: "Jam is starting a support call.",
  AI_CALL_ACTIVE: "AI support call active.",
  AI_CALL_USER_RESPONDED: "You responded. Your group can see that.",
  AI_CALL_USER_UNRESPONSIVE: "Jam is preparing an incident package for your group.",
  CONTACTS_NOTIFIED: "Your group and authorized contacts have been notified.",
  RESOLVED: "Marked safe.",
  CANCELLED: "Escalation cancelled.",
};

/** Placeholder only: explains what would happen and never dials. */
export function confirmEmergencyCall() {
  Alert.alert(
    "Call emergency services?",
    "In a full release this would open your phone's dialer with your local emergency number, so you can decide whether to call. This prototype never places calls for you.",
    [{ text: "OK" }],
  );
}

/** "I'm safe", "Cancel escalation", "Call emergency services": visible whenever the user has an open alert. */
export function SafetyControls({
  alert,
  onSafe,
  onCancel,
  compact,
}: {
  alert: AlertRow | null;
  onSafe: () => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      {alert && !compact ? <Text style={[type.body, styles.status]}>{STATE_COPY[alert.escalation_state]}</Text> : null}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={onSafe}
          disabled={!alert}
          style={({ pressed }) => [styles.button, styles.safe, (pressed || !alert) && styles.dim]}
        >
          <Text style={styles.safeText}>I&apos;m safe</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          disabled={!alert}
          style={({ pressed }) => [styles.button, styles.secondary, (pressed || !alert) && styles.dim]}
        >
          <Text style={styles.secondaryText}>Cancel escalation</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={confirmEmergencyCall}
        style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.dim]}
      >
        <Text style={styles.secondaryText}>Call emergency services</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(2) },
  status: { color: colors.navy, fontWeight: "600" },
  row: { flexDirection: "row", gap: space(2) },
  button: {
    flex: 1,
    minHeight: TAP_TARGET,
    paddingHorizontal: space(3),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  safe: { backgroundColor: colors.ok },
  safeText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.navy, fontSize: 15, fontWeight: "600" },
  dim: { opacity: 0.6 },
});
