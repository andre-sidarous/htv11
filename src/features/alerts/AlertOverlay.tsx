import * as Haptics from "expo-haptics";
import { router, type Href } from "expo-router";
import { memo, useEffect, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AlertResponseKind, SafetyAlert } from "@/lib/types";
import { colors, radius, shadow, space, TAP_TARGET, type } from "@/theme";
import { acknowledgeAlert, getLastSeen, resolveAlert, respond, type LastSeen } from "./api";
import { escalationLine, formatAgo, isAiCallState, responseStatus } from "./presentation";
import { useJamAlerts } from "./useJamAlerts";

/**
 * OWNER: P5. In-app alert cards ("Alex may need support."), rendered over every
 * active-Jam tab via <JamOverlayHost />. Not shown to the affected user themself.
 */
export function AlertOverlay({ jamId }: { jamId: string }) {
  const { me, alerts, names, responses, incidents, broadcast, addResponse } = useJamAlerts(jamId);
  const insets = useSafeAreaInsets();
  const visible = alerts.filter((a) => me && a.affectedUserId !== me);
  if (visible.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.host, { paddingTop: insets.top + space(2) }]}>
      {visible.slice(0, 2).map((alert) => (
        <AlertCard
          key={alert.id}
          alert={alert}
          jamId={jamId}
          name={names[alert.affectedUserId] ?? "A Jam member"}
          kinds={responses[alert.id] ?? []}
          incidentId={incidents[alert.id]}
          onUpdated={broadcast}
          onResponded={(kind) => addResponse(alert.id, kind)}
        />
      ))}
      {visible.length > 2 ? <Text style={[type.caption, styles.more]}>+{visible.length - 2} more alerts</Text> : null}
    </View>
  );
}

type CardProps = {
  alert: SafetyAlert;
  jamId: string;
  name: string;
  kinds: AlertResponseKind[];
  incidentId?: string;
  onUpdated: (alert: SafetyAlert) => Promise<void>;
  onResponded: (kind: AlertResponseKind) => void;
};

const AlertCard = memo(function AlertCard({ alert, jamId, name, kinds, incidentId, onUpdated, onResponded }: CardProps) {
  const [enter] = useState(() => new Animated.Value(0));
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState<"help" | "safe" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<LastSeen | null>(null);
  const [, tick] = useState(0);

  const resolved = Boolean(alert.resolvedAt);
  const status = responseStatus(kinds, resolved);
  const helping = kinds.includes("responding") || kinds.includes("acknowledged");
  const escalated = alert.escalationState === "CONTACTS_NOTIFIED" || alert.escalationState === "AI_CALL_USER_UNRESPONSIVE";

  // Calm entrance + light haptic, and mark it seen once.
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 4 }).start();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void respond(alert.id, "seen").then((e) => !e && onResponded("seen"));
    // Run once per card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getLastSeen(jamId, alert.affectedUserId).then((s) => !cancelled && setLastSeen(s));
    return () => {
      cancelled = true;
    };
  }, [jamId, alert.affectedUserId, alert.escalationState]);

  // Refresh the "N seconds ago" labels.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  async function help() {
    setBusy("help");
    setError(null);
    const { error: e, updated } = await acknowledgeAlert(alert);
    setBusy(null);
    if (e) return setError(e);
    onResponded("responding");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (updated) await onUpdated(updated);
  }

  async function markSafe() {
    setBusy("safe");
    setError(null);
    const { error: e, updated } = await resolveAlert(alert.id);
    setBusy(null);
    if (e) return setError(e);
    if (updated) await onUpdated(updated);
  }

  const style = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
  };

  if (collapsed) {
    return (
      <Animated.View style={style}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Show alert about ${name}`} onPress={() => setCollapsed(false)} style={[styles.pill, escalated && styles.pillEscalated]}>
          <Text style={styles.pillText}>{name} may need support · {status}</Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.card, style]} accessibilityLiveRegion="polite">
      <View style={[styles.accent, escalated ? styles.accentEscalated : resolved ? styles.accentOk : null]} />
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={[type.heading, styles.flex]} accessibilityRole="header">
            {resolved ? `${name} is marked safe.` : `${name} may need support.`}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{status}</Text>
          </View>
        </View>

        {!resolved ? <Text style={type.body}>{escalationLine(alert.escalationState, name)}</Text> : null}

        <Text style={type.caption}>
          No response since {formatAgo(alert.createdAt)}
          {lastSeen ? ` · Last seen ${formatAgo(lastSeen.lastSeenAt)}` : " · Location not shared"}
          {lastSeen?.activity ? ` · ${lastSeen.activity}` : ""}
        </Text>

        {alert.reasons.length > 0 && !resolved ? (
          <View style={styles.reasons}>
            {alert.reasons.slice(0, 3).map((r) => (
              <Text key={r} style={type.caption}>
                • {r}
              </Text>
            ))}
          </View>
        ) : null}

        {error ? <Text style={[type.caption, styles.error]}>{error}</Text> : null}

        {!resolved ? (
          <View style={styles.actions}>
            <Button
              label={helping ? "You're helping" : "I'm going to help"}
              primary
              disabled={helping}
              busy={busy === "help"}
              onPress={help}
            />
            <Button label="Open map" onPress={() => router.push(`/jam/${jamId}/map` as Href)} />
            {isAiCallState(alert.escalationState) ? (
              <Button label="Join call" onPress={() => router.push({ pathname: "/jam/[jamId]/support-call", params: { jamId } })} />
            ) : null}
            {incidentId ? <Button label="View incident" onPress={() => router.push({ pathname: "/incident/[token]", params: { token: incidentId } })} /> : null}
            <Button label="Mark safe" busy={busy === "safe"} onPress={markSafe} />
            <Button label="Hide" onPress={() => setCollapsed(true)} />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
});

function Button({ label, onPress, primary, disabled, busy }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; busy?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, primary && styles.buttonPrimary, (pressed || disabled) && styles.dim]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.warmWhite : colors.navy} />
      ) : (
        <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", top: 0, left: 0, right: 0, gap: space(2), paddingHorizontal: space(3) },
  flex: { flex: 1 },
  more: { alignSelf: "center" },
  card: { flexDirection: "row", overflow: "hidden", borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  accent: { width: 6, backgroundColor: colors.amber },
  accentEscalated: { backgroundColor: colors.escalation },
  accentOk: { backgroundColor: colors.ok },
  body: { flex: 1, gap: space(2), padding: space(4) },
  row: { flexDirection: "row", alignItems: "center", gap: space(2) },
  badge: { paddingHorizontal: space(3), paddingVertical: space(1), borderRadius: radius.pill, backgroundColor: colors.amberSoft },
  badgeText: { fontSize: 12, fontWeight: "600", color: colors.ink },
  reasons: { gap: space(1) },
  error: { color: colors.escalation },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(1) },
  button: {
    minHeight: TAP_TARGET - 8,
    paddingHorizontal: space(4),
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttonPrimary: { backgroundColor: colors.navy, borderColor: colors.navy },
  buttonText: { color: colors.navy, fontSize: 14, fontWeight: "600" },
  buttonTextPrimary: { color: colors.warmWhite },
  dim: { opacity: 0.6 },
  pill: { alignSelf: "center", minHeight: TAP_TARGET - 8, justifyContent: "center", paddingHorizontal: space(4), borderRadius: radius.pill, backgroundColor: colors.navy, ...shadow.card },
  pillEscalated: { backgroundColor: colors.escalation },
  pillText: { color: colors.warmWhite, fontSize: 14, fontWeight: "600" },
});
