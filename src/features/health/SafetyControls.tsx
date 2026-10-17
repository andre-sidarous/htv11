import { CircleCheck, CircleX, Siren } from "lucide-react-native";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui";
import type { AlertRow, EscalationState } from "@/lib/types";
import { colors, space, type } from "@/theme";

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

/** Confirm before stopping an escalation everywhere (it also clears the group's alert card). */
function confirmCancel(onCancel: () => void) {
  Alert.alert("Cancel this escalation?", "Your group's alert closes and no further steps run. Use this for a false alarm.", [
    { text: "Keep it", style: "cancel" },
    { text: "Cancel escalation", style: "destructive", onPress: onCancel },
  ]);
}

/**
 * "I'm safe", "Cancel escalation", "Call emergency services": visible whenever the user has an open
 * alert. `dark` restyles for the support-call screen.
 */
export function SafetyControls({
  alert,
  onSafe,
  onCancel,
  compact,
  dark,
}: {
  alert: AlertRow | null;
  onSafe: () => void;
  onCancel: () => void;
  compact?: boolean;
  dark?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      {alert && !compact ? <Text style={[type.label, styles.status]}>{STATE_COPY[alert.escalation_state]}</Text> : null}
      <View style={styles.row}>
        <Button
          label="I’m safe"
          icon={CircleCheck}
          onPress={onSafe}
          disabled={!alert}
          accessibilityHint="Closes the alert for you and your group"
          tint={dark ? colors.brandDark : undefined}
          style={[styles.flex, dark && styles.safeDark]}
        />
        <Button
          label="Cancel escalation"
          icon={CircleX}
          variant="outline"
          onPress={() => confirmCancel(onCancel)}
          disabled={!alert}
          accessibilityHint="Cancels the escalation after a confirmation"
          tint={dark ? colors.callInk : undefined}
          style={[styles.flex, dark && styles.outlineDark]}
        />
      </View>
      <Button
        label="Call emergency services"
        icon={Siren}
        variant="ghost"
        onPress={confirmEmergencyCall}
        accessibilityHint="Explains how emergency calling would work. Never dials by itself."
        tint={dark ? colors.callAccent : colors.escalation}
        style={[styles.emergency, dark && styles.emergencyDark]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(2) },
  status: { color: colors.brand },
  row: { flexDirection: "row", gap: space(2) },
  flex: { flex: 1 },
  safeDark: { backgroundColor: colors.callAccent },
  outlineDark: { backgroundColor: colors.callSurface, borderColor: colors.callSurfaceStrong },
  emergency: { borderWidth: 1, borderColor: colors.escalationSoft },
  emergencyDark: { borderColor: colors.callSurfaceStrong },
});
